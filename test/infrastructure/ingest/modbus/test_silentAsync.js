import assert from 'node:assert/strict';
import silentStreams from '../../../../src/infrastructure/ingest/modbus/silentStreams.js';

describe('silent fallback asynchronous lifecycle', function () {
    it('returns downstream delivery and waits for poll closure', async function () {
        let collector;
        let release;
        const closing = new Promise((resolve) => { release = resolve; });
        const gate = silentStreams({ budget: 15, interval: 5, delay() { return 0; }, clear() {}, sources: [{
            name() { return 'sensor'; },
            open(destination) { collector = destination; return { start() {}, stop() { return closing; } }; }
        }] });
        const accepted = Promise.resolve('durable');
        gate.bind({ write() { return accepted; } });
        await gate.start();
        assert.equal(collector.accept({ value: 42 }), accepted);
        let stopped = false;
        const result = gate.stop();
        assert.ok(result instanceof Promise);
        result.then(() => { stopped = true; });
        await Promise.resolve();
        assert.equal(stopped, false);
        release();
        await result;
    });
});
