import assert from 'node:assert/strict';
import createRegistry from '../../../src/application/runtime/createRegistry.js';

describe('generic collector registry', () => {
    it('offers every generic protocol in the same process without connecting at construction', () => {
        const registry = createRegistry();
        for (const name of ['stream', 'activity', 'modbus', 'amqp-relay', 'amqp-metrics', 'mqtt-metrics']) {
            assert.equal(typeof registry.get(name).create, 'function');
        }
        registry.get('stream').validate({ delivery: 'live', source: { type: 'opcua', connections: [] }, sinks: [{ type: 'amqp', url: { $secret: 'AMQP_URL' } }] });
    });
    it('derives physical serial claims from source config instead of trusting omitted resources', () => {
        const registry = createRegistry();
        const spec = { delivery: 'live', source: { type: 'serial', devices: [{ path: '/dev/ttyS4' }] }, sinks: [{ type: 'amqp', url: 'amqp://localhost' }] };
        assert.deepEqual(registry.get('stream').resources(spec), ['serial:/dev/ttyS4']);
    });
    it('does not silently overwrite registered adapters', () => {
        assert.throws(() => { createRegistry({ adapters: new Map([['stream', {}]]) }); }, /duplicate/u);
    });
});

describe('durable registry validation', () => {
    it('rejects MQTT QoS0 before opening any source', () => {
        const stream = createRegistry().get('stream');
        assert.throws(() => { stream.validate({ delivery: 'durable', stateVersion: 1, compatibilityKey: 'x',
            source: { type: 'interval', intervalMs: 1000 }, sinks: [{ type: 'mqtt', url: 'mqtt://localhost', options: { qos: 0 } }] }); }, /durable|QoS/u);
    });
    it('rejects duplicate recipient ids instead of silently dropping a required sink', () => {
        const stream = createRegistry().get('stream');
        assert.throws(() => { stream.validate({ delivery: 'live', source: { type: 'interval', intervalMs: 1000 },
            sinks: [{ id: 'same', type: 'mqtt' }, { id: 'same', type: 'amqp' }] }); }, /Duplicate/u);
    });
});


describe('pipeline revocation', () => {
    it('does not construct a transport after stop', async () => {
        const controller = new AbortController();
        const task = createRegistry().get('amqp-metrics').create({}, { signal: controller.signal });
        await task.stop();
        assert.throws(() => { task.start(); }, /Pipeline stopped/u);
    });
});
