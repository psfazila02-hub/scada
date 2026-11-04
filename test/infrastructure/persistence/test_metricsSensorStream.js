import assert from 'node:assert/strict';
import metricsSensor from '../../../src/infrastructure/persistence/metricsSensor.js';

describe('metricsSensor asynchronous stream acceptance', () => {
    it('does not advance the cursor or overlap reads while delivery is pending', async () => {
        const calls = [];
        let release;
        const since = new Date('2026-01-01T00:00:00Z');
        const read = { poll(topic, after) {
            calls.push(after);
            return Promise.resolve([{ ts: '2026-01-01T00:00:01', value: 1 }]);
        } };
        const sub = metricsSensor(read, 'topic', 'name', 'unit').stream(since, 5, () => {
            return new Promise((resolve) => { release = resolve; });
        });
        await new Promise((resolve) => { setTimeout(resolve, 30); });
        const observed = calls.length;
        const stopped = sub.cancel();
        release();
        await stopped;
        assert.equal(observed, 1);
        assert.equal(calls[0], since.toISOString());
    });
});
