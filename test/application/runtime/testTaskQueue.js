import assert from 'node:assert/strict';
import taskQueue from '../../../src/application/runtime/taskQueue.js';
import taskBudget from '../../../src/application/runtime/taskBudget.js';

describe('bounded task queue', () => {
    it('serializes operations, bounds waiting records and releases reservations after error', async () => {
        let release;
        const gate = new Promise(resolve => { release = resolve; });
        const budget = taskBudget({ maxBytes: 10, maxRecords: 2 });
        const queue = taskQueue({ budget, signal: new AbortController().signal });
        const calls = [];
        const first = queue.run(async () => { calls.push(1); await gate; throw new Error('offline'); }, { bytes: 4 });
        const failed = assert.rejects(first, /offline/u);
        const second = queue.run(() => { calls.push(2); }, { bytes: 4 });
        await assert.rejects(queue.run(() => { calls.push(3); }), /capacity/u);
        await new Promise(resolve => { setImmediate(resolve); });
        assert.deepEqual(calls, [1]);
        release();
        await Promise.all([failed, second]);
        await queue.drain();
        assert.deepEqual(calls, [1, 2]);
        assert.deepEqual(budget.status(), { bytes: 0, records: 0 });
    });
});
