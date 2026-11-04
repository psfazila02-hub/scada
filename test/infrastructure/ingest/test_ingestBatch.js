import assert from 'node:assert/strict';
import ingestBatch from '../../../src/infrastructure/ingest/ingestBatch.js';

describe('production ingest batching', function () {
    it('keeps acceptance pending until a low-volume durable write finishes', async function () {
        let release;
        let written;
        const pending = new Promise((resolve) => { release = resolve; });
        const collector = ingestBatch({ write(records) { written = records; return pending; } },
            { size: 10, maxWaitMs: 10 });
        let delivered = false;
        const accepted = collector.accept({ value: 42 }).then(() => { delivered = true; });
        await new Promise((resolve) => { setTimeout(resolve, 30); });
        assert.deepEqual(written, [{ value: 42 }]);
        assert.equal(delivered, false);
        release();
        await accepted;
        await collector.stop();
        assert.equal(delivered, true);
    });
    it('flushes records on stop and propagates storage rejection to the caller', async function () {
        const collector = ingestBatch({ write() { return Promise.reject(new Error('disk full')); } }, { size: 10 });
        const accepted = assert.rejects(collector.accept({ value: 42 }), /disk full/u);
        await assert.rejects(collector.stop(), /disk full/u);
        await accepted;
    });
});
