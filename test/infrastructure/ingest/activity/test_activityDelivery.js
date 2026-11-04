import assert from 'node:assert/strict';
import http from 'node:http';
import activityTracking from '../../../../src/infrastructure/ingest/activity/activityTracking.js';

async function listen(handler) {
    const server = http.createServer(handler);
    await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
    return { url: `http://127.0.0.1:${server.address().port}`, async stop() {
        server.closeAllConnections();
        await new Promise((resolve) => { server.close(resolve); });
    } };
}
describe('activity serial acknowledgement', function () {
    it('persists a log without waiting for the next serially delivered record', async function () {
        let writes = 0;
        const destination = await listen((request, response) => {
            request.resume();
            request.on('end', () => { writes += 1; response.end(); });
        });
        const line = JSON.stringify({ StartUTC: new Date().toISOString(), RequestMethod: 'GET', RequestPath: '/' });
        const origin = await listen((request, response) => {
            response.end(JSON.stringify({ status: 'success', data: { resultType: 'streams', result: [{ values: [['100000000', line]] }] } }));
        });
        const pipeline = activityTracking(origin.url, destination.url, '{}', { poll: 0.01, size: 3, maxWaitMs: 1000 });
        try {
            await pipeline.start();
            await new Promise((resolve) => { setTimeout(resolve, 150); });
            assert.ok(writes > 0, 'first record must not depend on another outstanding acceptance');
        } finally {
            await pipeline.stop();
            await Promise.all([origin.stop(), destination.stop()]);
        }
    });
});
