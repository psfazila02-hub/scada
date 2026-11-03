import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const chart = fileURLToPath(new URL('../../charts/scada', import.meta.url));

function render(values) {
    return execFileSync('helm', ['template', 'demo', chart, '-f', '-'], {
        timeout: 30000, encoding: 'utf8', input: JSON.stringify({ image: 'example.invalid/app:1', ...values })
    });
}

describe('named processes in the scada chart', function() {
    this.timeout(35000);

    it('can run a single named reader without site services or a database', function() {
        const manifest = render({
            site: { enabled: false }, sink: { enabled: false }, postgres: { enabled: false },
            rabbitmq: { enabled: false }, prefix: 'station', workloadLabels: { zone: 'east' },
            processes: [{ name: 'reader', command: ['read'], env: { INTERVAL: 5 }, hostDevices: ['/dev/ttyS2'] }]
        });
        assert.equal((manifest.match(/^kind: /gmu) || []).length, 1);
        assert.ok(manifest.includes('name: station-reader'));
        assert.ok(manifest.includes('      app: reader\n  template:'));
        assert.ok(manifest.includes('zone: east'));
        assert.ok(manifest.includes('type: Recreate'));
        assert.ok(manifest.includes('value: "5"'));
        assert.ok(manifest.includes('type: CharDevice'));
    });

    it('can use a named broker PVC, MQTT node port, configuration and explicit definitions', function() {
        const manifest = render({ rabbitmq: {
            claimName: 'persisted-queue', configName: 'broker-settings', plugins: ['rabbitmq_management'],
            extraConfig: { heartbeat: 40 }, definitions: { vhosts: [{ name: 'test' }] },
            service: { type: 'NodePort', nodePorts: { mqtt: 30123 } }
        } });
        assert.ok(manifest.includes('claimName: persisted-queue'));
        assert.ok(manifest.includes('kind: PersistentVolumeClaim\nmetadata:\n  name: persisted-queue'));
        assert.ok(manifest.includes('name: broker-settings'));
        assert.ok(manifest.includes('nodePort: 30123'));
        assert.ok(manifest.includes('heartbeat = 40'));
        assert.ok(manifest.includes('[rabbitmq_management].'));
        assert.ok(manifest.includes('"name": "test"'));
        assert.ok(!manifest.includes('scada.segments.ingest'));
    });

    it('rejects two named readers that claim the same physical device', function() {
        const processes = ['left', 'right'].map((name) => {
            return { name, command: [name], hostDevices: ['/dev/ttyS1'] };
        });
        assert.throws(() => { render({ processes }); }, /both claim \/dev\/ttyS1/u);
    });
});
