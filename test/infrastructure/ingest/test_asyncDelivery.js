import assert from 'node:assert/strict';
import metricsCodec from '../../../src/infrastructure/ingest/mqtt/metricsTransformer.js';
import activityCodec from '../../../src/infrastructure/ingest/activity/activityTransformer.js';
import registerPublish from '../../../src/infrastructure/ingest/mqtt/registerPublish.js';
import { mx210Metrics } from '../../../src/infrastructure/ingest/modbus/mx210Tcp.js';
import { relayConsumer } from '../../../src/infrastructure/ingest/telemetry/amqpMqttRelay.js';
import { telemetryConsumer } from '../../../src/infrastructure/ingest/telemetry/amqpMetricsIngest.js';

describe('ingest asynchronous delivery', function () {
    const fixtures = [
        ['numeric metrics', (sink) => { return metricsCodec(sink); }, { topic: 'temperature', payload: '42' }],
        ['object metrics', (sink) => { return metricsCodec(sink); }, { topic: 'temperature', payload: '{"value":42}' }],
        ['activity', (sink) => { return activityCodec(sink); }, { line: '{"StartUTC":"2026-01-01","RequestMethod":"GET","RequestPath":"/"}' }],
        ['register values', (sink) => { return registerPublish([{ point: 'holding:0', topic: 'temperature' }], 0, sink); }, [42]],
        ['MX210 values', (sink) => { return mx210Metrics('sensor', sink); }, Array(14).fill(0)]
    ];
    fixtures.forEach(([name, create, input]) => {
        it(`${name} propagates asynchronous sink rejection`, async function () {
            const error = new Error('durable write failed');
            const sink = { accept() { const promise = Promise.reject(error); promise.catch(() => {}); return promise; } };
            const result = create(sink).accept(input);
            assert.ok(result instanceof Promise, 'accept must return delivery completion');
            await assert.rejects(result, /durable write failed/u);
        });
    });
    it('does not swallow synchronous activity storage errors as malformed logs', function () {
        const codec = activityCodec({ accept() { throw new Error('storage offline'); } });
        assert.throws(() => { codec.accept(fixtures[2][2]); }, /storage offline/u);
    });
    it('keeps relay messages unacknowledged when publishing fails', async function () {
        let acked = false;
        const failed = Promise.reject(new Error('publish failed'));
        failed.catch(() => {});
        const consume = relayConsumer({ write() { return failed; } }, { ack() { acked = true; } });
        const result = consume({ fields: { routingKey: 'temperature' }, content: Buffer.from('42') });
        assert.equal(acked, false);
        await assert.rejects(result, /publish failed/u);
    });
    it('acknowledges telemetry only after durable delivery completes', async function () {
        let release;
        const pending = new Promise((resolve) => { release = resolve; });
        const acked = [];
        const consume = telemetryConsumer({ accept() { return pending; } }, { ack(msg) { acked.push(msg); } });
        const message = { fields: { routingKey: 'temperature' }, content: Buffer.from('42') };
        const result = consume(message);
        assert.equal(acked.length, 0);
        release();
        await result;
        assert.deepEqual(acked, [message]);
    });
});
