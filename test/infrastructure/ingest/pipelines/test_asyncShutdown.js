import assert from 'node:assert/strict';
import decisionPipeline from '../../../../src/infrastructure/ingest/pipelines/decisionPipeline.js';
import alertPipeline from '../../../../src/infrastructure/ingest/pipelines/alertPipeline.js';

describe('STOMP ingest shutdown', function () {
    [decisionPipeline, alertPipeline].forEach((factory) => {
        it(`${factory.name} returns database cleanup completion`, async function () {
            let release;
            const pending = new Promise((resolve) => { release = resolve; });
            const pipeline = factory('stomp://localhost:61613', { query() {}, end() { return pending; } }, {});
            const result = pipeline.stop();
            assert.ok(result instanceof Promise);
            let stopped = false;
            result.then(() => { stopped = true; });
            await Promise.resolve();
            assert.equal(stopped, false);
            release();
            await result;
        });
    });
});
