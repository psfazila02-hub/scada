import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'mocha';
import modbusPublish, { measurementPlans } from '../../../../src/infrastructure/ingest/mqtt/modbusPublish.js';
import registerPublish from '../../../../src/infrastructure/ingest/mqtt/registerPublish.js';
import { decodePoint } from '../../../../src/infrastructure/ingest/mqtt/registerPoint.js';

describe('register point', () => {
    it('decodes one uint16 holding register', () => {
        const origin = 1000 + Math.floor(Math.random() * 50);
        const value = Math.floor(Math.random() * 60000) + 3;
        assert.strictEqual(
            decodePoint(`holding:${origin}`, origin, [value]),
            value,
            'a holding point did not return the uint16 in the window'
        );
    });

    it('decodes an abcd float from the register window', () => {
        const origin = 2000 + Math.floor(Math.random() * 40);
        assert.strictEqual(
            decodePoint(`holding:${origin}:abcd`, origin, [16256, 0]),
            1,
            'abcd word order did not decode the float 1'
        );
    });

    it('decodes a cdab float from the register window', () => {
        const origin = 3000 + Math.floor(Math.random() * 40);
        assert.strictEqual(
            decodePoint(`holding:${origin}:cdab`, origin, [0, 16256]),
            1,
            'cdab word order did not decode the float 1'
        );
    });
});

describe('modbusPublish', () => {
    it('names a measurement by the document path', () => {
        const stem = `mill/ünit-${Math.random().toString(36).slice(2, 6)}/electrical`;
        const received = [];
        const plans = measurementPlans(stem, { voltage: 'holding:4000:cdab' });
        const transformer = registerPublish(plans, 4000, {
            accept(record) {
                received.push(record);
            }
        });
        transformer.accept([32768, 17254]);
        assert.strictEqual(
            received[0].topic,
            `${stem}/voltage`,
            'the collector published voltage on a device topic'
        );
    });

    it('uses the parameter id when the stream is empty', () => {
        const key = `p${Math.random().toString(36).slice(2, 6)}`;
        const received = [];
        const plans = measurementPlans('', { [key]: 'holding:8' });
        const transformer = registerPublish(plans, 8, {
            accept(record) {
                received.push(record);
            }
        });
        transformer.accept([41]);
        assert.strictEqual(
            received[0].topic,
            key,
            'an empty stream invented a device topic'
        );
    });

    it('builds a pipeline for a mapped device address', () => {
        const host = `192.0.2.${Math.floor(Math.random() * 200) + 1}`;
        const stem = `bay/ünit-${Math.random().toString(36).slice(2, 5)}`;
        const pipeline = modbusPublish(`mqtt://broker-${Math.random().toString(36).slice(2)}`, {
            addresses: [`modbus://${host}:502?at=4000&count=2`],
            clientId: `modbus-${Math.random().toString(36).slice(2, 6)}`,
            interval: 5,
            maps: [{ voltage: 'holding:4000:abcd' }],
            streams: [stem],
            threshold: 5,
            timeout: 60
        });
        assert.strictEqual(
            typeof pipeline.start,
            'function',
            'a mapped address did not build a modbus pipeline'
        );
    });

    it('reads document paths from STREAM and MAPPING', () => {
        const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
        const source = fs.readFileSync(path.join(root, 'src/bin/modbus-to-mqtt.js'), 'utf8');
        assert.strictEqual(
            source.includes('process.env.STREAM')
                && source.includes('process.env.MAPPING')
                && source.includes('process.env.ADDRESS')
                && source.includes('process.env.PATH') === false,
            true,
            'modbus-to-mqtt took document paths from PATH'
        );
    });
});
