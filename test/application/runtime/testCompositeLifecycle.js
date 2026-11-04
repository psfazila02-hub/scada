import assert from 'node:assert/strict';
import compositeLifecycle from '../../../src/application/runtime/compositeLifecycle.js';

describe('composite lifecycle', () => {
    it('cleans already opened outputs when an input fails to start', async () => {
        const events = [];
        const lifecycle = compositeLifecycle({ inputs: [{ start() { throw new Error('failed'); }, stop() { events.push('input.stop'); } }],
            outputs: [{ start() { events.push('output.start'); }, stop() { events.push('output.stop'); } }] });
        await assert.rejects(lifecycle.start(), /failed/u);
        assert.deepEqual(events, ['output.start', 'input.stop', 'output.stop']);
    });
    it('stops outputs even after input cleanup fails and retains the failure', async () => {
        const events = [];
        const lifecycle = compositeLifecycle({ inputs: [{ start() {}, stop() { throw new Error('stuck'); } }],
            outputs: [{ start() {}, stop() { events.push('closed'); } }] });
        await lifecycle.start();
        await assert.rejects(lifecycle.stop(), /cleanup/u);
        assert.deepEqual(events, ['closed']);
    });
});

describe('composite cancellation during startup', () => {
    it('calls stop on a pending start before waiting for start completion', async () => {
        let cancel;
        let stopped = false;
        const pending = new Promise((resolve, reject) => { cancel = reject; });
        const task = compositeLifecycle({ outputs: [], inputs: [{ start() { return pending; }, stop() {
            stopped = true;
            cancel(new Error('aborted'));
        } }] });
        const opening = assert.rejects(task.start(), /aborted/u);
        const closing = task.stop();
        await new Promise(resolve => { setImmediate(resolve); });
        assert.equal(stopped, true);
        await Promise.all([opening, closing]);
    });
});
