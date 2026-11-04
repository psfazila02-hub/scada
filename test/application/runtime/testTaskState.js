import assert from 'node:assert/strict';
import taskState from '../../../src/application/runtime/taskState.js';

function store() {
    let saved = null;
    return { async load() { return saved && structuredClone(saved); }, async commit(next) {
        if ((saved?.version ?? 0) !== next.expectedVersion) { throw new Error('state conflict'); }
        saved = { ...structuredClone(next), version: next.expectedVersion + 1 };
        return saved.version;
    } };
}
describe('portable task state', () => {
    it('persists partial fan-out and resumes only pending sinks with the same event id', async () => {
        const storage = store();
        const accepted = [];
        let down = true;
        const sinks = { first: { async write(rows) { accepted.push(['first', rows[0].eventId]); } },
            second: { async write(rows) { if (down) { throw new Error('offline'); } accepted.push(['second', rows[0].eventId]); } } };
        const state = taskState(storage, { taskId: 'one', stateVersion: 1, compatibilityKey: 'source1' });
        await state.open();
        await assert.rejects(state.deliver({ eventId: 'event1', payload: 12 }, sinks, { cursor: 42 }), /offline/u);
        down = false;
        const restored = taskState(storage, { taskId: 'one', stateVersion: 1, compatibilityKey: 'source1' });
        await restored.open();
        await restored.resume(sinks);
        assert.deepEqual(accepted, [['first', 'event1'], ['second', 'event1']]);
        assert.deepEqual(restored.snapshot().checkpoint, { cursor: 42 });
    });
    it('rejects incompatible recovered state before use', async () => {
        const storage = store();
        const first = taskState(storage, { taskId: 'one', stateVersion: 1, compatibilityKey: 'source1' });
        await first.open();
        await first.deliver({ eventId: 'x' }, { sink: { async write() {} } }, 1);
        const changed = taskState(storage, { taskId: 'one', stateVersion: 1, compatibilityKey: 'source2' });
        await assert.rejects(changed.open(), /incompatible/u);
    });
    it('does not advance a checkpoint or replay a sink after state CAS fails', async () => {
        const storage = store();
        const first = taskState(storage, { taskId: 'one', stateVersion: 1, compatibilityKey: 'source1' });
        const second = taskState(storage, { taskId: 'one', stateVersion: 1, compatibilityKey: 'source1' });
        await Promise.all([first.open(), second.open()]);
        await first.deliver({ eventId: 'x' }, { sink: { async write() {} } }, 1);
        let calls = 0;
        await assert.rejects(second.deliver({ eventId: 'y' }, { sink: { async write() { calls += 1; } } }, 2), /conflict/u);
        assert.equal(calls, 0);
    });
});

describe('checkpoint without emitted events', () => {
    it('persists a no-output cursor and rejects overwriting a pending delivery', async () => {
        const storage = store();
        const state = taskState(storage, { taskId: 'one', stateVersion: 1, compatibilityKey: 'source1' });
        await state.open();
        await state.checkpoint({ cursor: 3 });
        await assert.rejects(state.deliver({ eventId: 'x' }, { sink: { async write() { throw new Error('offline'); } } }, 4), /offline/u);
        await assert.rejects(state.checkpoint({ cursor: 5 }), /Pending/u);
        assert.deepEqual((await storage.load()).checkpoint, { cursor: 3 });
    });
});

describe('state failure fencing', () => {
    it('does not repeat a sink effect after the acknowledgement CAS failed', async () => {
        let commits = 0;
        let writes = 0;
        const storage = { async load() { return null; }, async commit() {
            commits += 1;
            if (commits > 1) { throw new Error('state conflict'); }
            return 1;
        } };
        const state = taskState(storage, { taskId: 'one', stateVersion: 1, compatibilityKey: 'source1' });
        const sinks = { target: { async write() { writes += 1; } } };
        await state.open();
        await assert.rejects(state.deliver({ eventId: 'event1' }, sinks, 3), /conflict/u);
        await assert.rejects(state.resume(sinks), /reload/u);
        await assert.rejects(state.resume(sinks), /reload/u);
        assert.equal(writes, 1);
    });
});


describe('durable record encoding', () => {
    it('rejects binary records before persisting or publishing them', async () => {
        const state = taskState(store(), { taskId: 'one', stateVersion: 1, compatibilityKey: 'one' });
        await state.open();
        let writes = 0;
        await assert.rejects(state.deliver({ eventId: 'one', body: Buffer.from('binary') },
            { sink: { write() { writes += 1; } } }, null), /JSON|binary/u);
        assert.equal(writes, 0);
        assert.equal(state.snapshot().pending, null);
    });
});
