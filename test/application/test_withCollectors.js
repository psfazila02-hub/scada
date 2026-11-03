import assert from 'node:assert';
import withCollectors from '../../src/application/deploy/withCollectors.js';

describe('withCollectors', function() {
    it('fills command address and path from the plant command', function() {
        const host = `192.0.2.${Math.floor(Math.random() * 200) + 1}`;
        const bin = `bin/${Math.random().toString(36).slice(2, 6)}.js`;
        const name = `mill/hall-${Math.random().toString(36).slice(2, 6)}/electrical`;
        const values = withCollectors({
            machines: [{ from: `modbus://${host}:502`, name }]
        }, () => {
            return ['node', bin];
        });
        assert.deepStrictEqual(
            values.collectors,
            [{
                address: `modbus://${host}:502`,
                command: ['node', bin],
                path: name
            }],
            'withCollectors dropped the plant command'
        );
    });

    it('copies a mapping the machine already has', function() {
        const host = `192.0.2.${Math.floor(Math.random() * 200) + 1}`;
        const point = `holding:${4000 + Math.floor(Math.random() * 12)}:cdab`;
        const values = withCollectors({
            machines: [{
                from: `modbus://${host}:502`,
                mapping: { voltage: point },
                name: 'mill/electrical'
            }]
        }, () => {
            return ['node', 'bin/modbus-to-mqtt.js'];
        });
        assert.strictEqual(
            values.collectors[0].mapping.voltage,
            point,
            'withCollectors dropped the machine mapping'
        );
    });
});
