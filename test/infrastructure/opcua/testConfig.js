import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

// Deployment planning must remain pure even when the network library logs on import.
describe('OPC UA configuration import', function() {
    it('validates without loading the OPC UA runtime or writing diagnostics', function() {
        const result = spawnSync(process.execPath, ['--input-type=module', '-e', `
            import { createRequire } from 'node:module';
            import { validateConnections } from '@yarkivaev/scada/opcua/config';
            const require = createRequire(import.meta.url);
            const loaded = Object.keys(require.cache).length > 0;
            process.stdout.write(JSON.stringify({ loaded, validated: validateConnections([]) }));
        `], { encoding: 'utf8', timeout: 15000 });
        assert.equal(result.status, 0, result.stderr);
        assert.deepEqual(JSON.parse(result.stdout), {loaded: false, validated: []});
    });
});
