import assert from 'node:assert/strict';
import taskBudget from '../../../src/application/runtime/taskBudget.js';

describe('shared task budgets', () => {
    it('bounds bytes across tasks and releases reservations once', () => {
        const shared = taskBudget({ maxBytes: 10, maxRecords: 3 });
        const first = taskBudget({ maxBytes: 8, maxRecords: 2 }, shared);
        const other = taskBudget({ maxBytes: 8, maxRecords: 2 }, shared);
        const release = first.reserve({ bytes: 6, records: 1 });
        assert.throws(() => { other.reserve({ bytes: 5, records: 1 }); }, /capacity/u);
        assert.deepEqual(other.status(), { bytes: 0, records: 0 });
        release(); release();
        const free = other.reserve({ bytes: 8, records: 2 });
        assert.deepEqual(shared.status(), { bytes: 8, records: 2 });
        free();
        assert.deepEqual(shared.status(), { bytes: 0, records: 0 });
    });
    it('rejects malformed reservations without corrupting accounting', () => {
        const budget = taskBudget({ maxBytes: 10, maxRecords: 3 });
        assert.throws(() => { budget.reserve({ bytes: -1, records: 1 }); }, /reservation/u);
        assert.throws(() => { budget.reserve({ bytes: 1, records: Infinity }); }, /reservation/u);
        assert.deepEqual(budget.status(), { bytes: 0, records: 0 });
    });
});
