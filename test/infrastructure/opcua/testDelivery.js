import assert from 'node:assert/strict';
import delivery from '../../../src/infrastructure/opcua/delivery.js';

describe('OPC UA bounded delivery', function () {
    it('keeps timed-out writes within the capacity across subsequent attempts', async function () {
        let calls = 0;
        let signal;
        const send = delivery((channel, value, context) => {
            calls += 1;
            signal = context.signal;
            return new Promise(() => {});
        }, { maxPending: 1, maxPendingBytes: 100, deliveryTimeoutMs: 20 });
        await assert.rejects(send({}, 1), /deadline/u);
        assert.equal(signal.aborted, true);
        await assert.rejects(send({}, 2), /capacity/u);
        assert.equal(calls, 1);
    });
    it('does not begin queued publication after cancellation', async function () {
        let calls = 0;
        const controller = new AbortController();
        const send = delivery(() => { calls += 1; }, { maxPending: 1, maxPendingBytes: 100, deliveryTimeoutMs: 20 });
        const result = send({}, 1, { signal: controller.signal });
        controller.abort(new Error('assignment revoked'));
        await assert.rejects(result, /assignment revoked/u);
        assert.equal(calls, 0);
    });
    it('rejects oversized values before invoking the collector', async function () {
        let calls = 0;
        const send = delivery(() => { calls += 1; }, { maxPending: 2, maxPendingBytes: 10, deliveryTimeoutMs: 20 });
        await assert.rejects(send({}, 'x'.repeat(100)), /capacity/u);
        assert.equal(calls, 0);
    });
    it('returns capacity after actual completion and propagates failures', async function () {
        const send = delivery(() => { return Promise.reject(new Error('sink failed')); },
            { maxPending: 1, maxPendingBytes: 100, deliveryTimeoutMs: 20 });
        await assert.rejects(send({}, 1), /sink failed/u);
        await assert.rejects(send({}, 2), /sink failed/u);
    });
});
