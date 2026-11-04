import assert from 'node:assert/strict';
import runCollector from '../../../src/application/runtime/runCollector.js';

function registry(events) {
    return new Map([['test', { validate() {}, resources() { return []; }, create(spec) {
        return { start() { events.push(`start:${spec.value}`); }, stop() { events.push(`stop:${spec.value}`); } };
    } }]]);
}
function document(value) {
    return { assignments: [{ taskId: 'one', generation: value, specVersion: 1, spec: { adapter: 'test', value } }] };
}
describe('collector manifest reader', () => {
    it('reads fresh manifests on startup and every reload', async () => {
        const events = [];
        let calls = 0;
        const collector = await runCollector({ registry: registry(events), env: {}, argv: [], signals: false,
            async manifestReader() { calls += 1; return document(calls); } });
        try {
            await collector.reload();
            await collector.reload();
            assert.equal(calls, 3);
            assert.equal(collector.runtime.status().tasks[0].generation, 3);
            assert.deepEqual(events, ['start:1', 'stop:1', 'start:2', 'stop:2', 'start:3']);
        } finally { await collector.stop(); }
    });
    it('supplies a current status snapshot so readers can retire running tasks', async () => {
        const events = [];
        const snapshots = [];
        const env = {};
        const argv = [];
        const collector = await runCollector({ registry: registry(events), env, argv, signals: false,
            manifestReader(inputEnv, inputArgv, status) {
                assert.equal(inputEnv, env);
                assert.equal(inputArgv, argv);
                assert.ok(status);
                snapshots.push(status);
                if (status.tasks.length === 0) { return document(1); }
                return { assignments: [], removals: status.tasks.map(({ taskId, generation }) => {
                    return { taskId, generation: generation + 1 };
                }) };
            } });
        try {
            await collector.reload();
            assert.deepEqual(snapshots[0].tasks, []);
            assert.equal(snapshots[1].tasks[0].taskId, 'one');
            assert.equal(snapshots[1].tasks[0].generation, 1);
            assert.equal(snapshots[1].tasks[0].state, 'running');
            assert.deepEqual(events, ['start:1', 'stop:1']);
            assert.equal(collector.runtime.status().tasks[0].state, 'stopped');
        } finally { await collector.stop(); }
    });
    it('preserves a running task on invalid manifests and permits the next reload', async () => {
        const events = [];
        const invalid = document(2);
        invalid.assignments.push({ taskId: 'two', generation: 1, specVersion: 1, spec: { adapter: 'missing' } });
        const manifests = [document(1), invalid, document(2)];
        const collector = await runCollector({ registry: registry(events), env: {}, argv: [], signals: false,
            manifestReader() { return manifests.shift(); } });
        try {
            await assert.rejects(collector.reload(), /adapter/u);
            assert.deepEqual(events, ['start:1']);
            assert.equal(collector.runtime.status().tasks[0].generation, 1);
            await collector.reload();
            assert.deepEqual(events, ['start:1', 'stop:1', 'start:2']);
        } finally { await collector.stop(); }
    });
});

describe('collector startup signals', () => {
    const signals = ['SIGTERM', 'SIGINT', 'SIGHUP'];
    function counts() { return signals.map((signal) => { return process.listenerCount(signal); }); }
    it('owns signal handlers while the initial manifest is still pending', async () => {
        const before = counts();
        let release;
        const pending = new Promise((resolve) => { release = resolve; });
        const startup = runCollector({ registry: registry([]), env: {}, argv: [],
            manifestReader() { return pending; } });
        try {
            assert.deepEqual(counts(), before.map((count) => { return count + 1; }));
        } finally {
            release({ assignments: [] });
            const collector = await startup;
            await collector.stop();
        }
        assert.deepEqual(counts(), before);
    });
    it('detaches startup handlers when the initial manifest fails', async () => {
        const before = counts();
        await assert.rejects(runCollector({ registry: registry([]), env: {}, argv: [],
            manifestReader() { throw new Error('manifest unavailable'); } }), /manifest unavailable/u);
        assert.deepEqual(counts(), before);
    });
});
