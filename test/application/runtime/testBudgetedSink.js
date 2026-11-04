import assert from 'node:assert/strict';
import budgetedSink from '../../../src/application/runtime/budgetedSink.js';
import taskBudget from '../../../src/application/runtime/taskBudget.js';

describe('sink reservation lifetime', () => {
    it('retains capacity until actual write settles even after caller cancellation', async () => {
        let finish;
        const actual = new Promise(resolve => { finish = resolve; });
        const budget = taskBudget({ maxBytes: 100, maxRecords: 1 });
        const sink = budgetedSink({ write() { return actual; } }, budget);
        const controller = new AbortController();
        const pending = sink.write(['one'], { signal: controller.signal });
        await new Promise(resolve => { setImmediate(resolve); });
        controller.abort();
        await assert.rejects(sink.write(['two']), /capacity/u);
        assert.equal(budget.status().records, 1);
        finish();
        await pending;
        assert.deepEqual(budget.status(), { bytes: 0, records: 0 });
    });
});
