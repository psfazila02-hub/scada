import assert from 'node:assert/strict';
import createRuntime from '../../../src/application/runtime/runtime.js';
import streamTask from '../../../src/application/runtime/streamTask.js';

function sharedStore() {
    const documents = new Map();
    return {
        async load(id) { return structuredClone(documents.get(id) ?? null); },
        async commit(next) {
            const current = documents.get(next.taskId);
            if ((current?.version ?? 0) !== next.expectedVersion) { throw new Error('CAS conflict'); }
            const version = next.expectedVersion + 1;
            documents.set(next.taskId, structuredClone({ ...next, version }));
            return version;
        }
    };
}
function fixture(stateStore = sharedStore()) {
    const handles = new Map();
    const effects = [];
    const behavior = new Map();
    function source(spec, collector, context) {
        const handle = { collector, restored: null, starts: 0, stops: 0, signal: context.signal };
        handles.set(context.taskId, handle);
        return { restore(cursor) { handle.restored = cursor; }, start() { handle.starts += 1; }, stop() { handle.stops += 1; } };
    }
    const ports = { transforms: new Map(), sources: new Map([['serial', source], ['broker', source], ['poller', source]]),
        sinks: new Map([['confirmed', (spec) => { return {
            async write(rows) {
                if (behavior.has(spec.id)) { await behavior.get(spec.id)(rows); }
                effects.push(...rows.map((row) => { return [spec.id, row.eventId]; }));
            }
        }; }]]) };
    const registry = new Map(['serial', 'broker', 'poller'].map((name) => { return [name, streamTask(ports)]; }));
    return { handles, effects, behavior, stateStore, registry,
        runtime: createRuntime({ registry, stateStore, budgets: { maxBytes: 4096, maxRecords: 3 } }) };
}
function assignment(taskId, adapter, durable = false) {
    return { taskId, generation: 1, specVersion: 1, spec: { adapter, source: { type: adapter },
        delivery: durable ? 'durable' : 'live', stateVersion: 1, compatibilityKey: taskId,
        sinks: [{ type: 'confirmed', id: taskId }], limits: { maxBytes: 2048, maxRecords: 1 }, resources: [`input:${taskId}`] } };
}
function turn() { return new Promise(setImmediate); }

describe('mixed executor controlled IO integration', () => {
    it('bounds a stalled task while heterogeneous neighbors continue and replacement revokes old callbacks', async () => {
        const test = fixture();
        let release;
        test.behavior.set('serial', () => { return new Promise((resolve) => { release = resolve; }); });
        try {
            await Promise.all(['serial', 'broker', 'poller'].map((name) => { return test.runtime.apply(assignment(name, name)); }));
            const old = test.handles.get('serial');
            const pending = old.collector.accept({ eventId: 's1', value: 1 });
            await turn();
            await assert.rejects(old.collector.accept({ eventId: 's2' }), /capacity/u);
            await Promise.all(['broker', 'poller'].map((name) => { return test.handles.get(name).collector.accept({ eventId: name }); }));
            assert.deepEqual(test.effects, [['broker', 'broker'], ['poller', 'poller']]);
            assert.equal(test.runtime.status().budget.records, 1);
            assert.ok(test.runtime.status().budget.bytes > 0 && test.runtime.status().budget.bytes <= 4096);
            release();
            await pending;
            await test.runtime.apply({ ...assignment('serial', 'serial'), generation: 2 });
            assert.equal(old.signal.aborted, true);
            await assert.rejects(old.collector.accept({ eventId: 'late' }), /revoked/iu);
            assert.equal(test.effects.some(([, id]) => { return id === 'late'; }), false);
            assert.deepEqual(test.runtime.status().budget, { bytes: 0, records: 0 });
        } finally { release?.(); await test.runtime.stop(); }
    });

    it('recovers uncertain fan-out with stable identity and restored cursor in a fresh executor', async () => {
        const test = fixture();
        const request = assignment('replay', 'broker', true);
        request.spec.sinks = [{ type: 'confirmed', id: 'a' }, { type: 'confirmed', id: 'b' }];
        const applied = new Set();
        let attempts = 0;
        test.behavior.set('b', (rows) => {
            applied.add(rows[0].eventId);
            attempts += 1;
            if (attempts === 1) { throw new Error('confirm lost'); }
        });
        await test.runtime.apply(request);
        await assert.rejects(test.handles.get('replay').collector.accept({ eventId: 'stable-7', checkpoint: 7 }), /confirm lost/u);
        assert.deepEqual((await test.stateStore.load('replay')).pending.remaining, ['b']);
        await test.runtime.stop();
        const replacement = createRuntime({ registry: test.registry, stateStore: test.stateStore });
        try {
            await replacement.apply({ ...request, generation: 2 });
            assert.equal(test.handles.get('replay').restored, 7);
            assert.deepEqual(test.effects, [['a', 'stable-7'], ['b', 'stable-7']]);
            assert.equal(attempts, 2);
            assert.equal(applied.size, 1);
            assert.equal((await test.stateStore.load('replay')).pending, null);
            assert.equal((await test.stateStore.load('replay')).checkpoint, 7);
        } finally { await replacement.stop(); }
    });

    it('a stale executor cannot publish after its outbox CAS loses to another executor', async () => {
        const test = fixture();
        const request = assignment('replay', 'broker', true);
        const rival = createRuntime({ registry: test.registry, stateStore: test.stateStore });
        try {
            await test.runtime.apply(request);
            const stale = test.handles.get('replay');
            await rival.apply({ ...request, generation: 2 });
            await test.handles.get('replay').collector.accept({ eventId: 'new', checkpoint: 2 });
            await assert.rejects(stale.collector.accept({ eventId: 'old', checkpoint: 1 }), /CAS conflict/u);
            await assert.rejects(stale.collector.accept({ eventId: 'old', checkpoint: 1 }), /requires reload/u);
            assert.deepEqual(test.effects, [['replay', 'new']]);
            assert.equal((await test.stateStore.load('replay')).checkpoint, 2);
        } finally { await Promise.all([test.runtime.stop(), rival.stop()]); }
    });
});
