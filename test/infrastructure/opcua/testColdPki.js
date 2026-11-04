import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';

const execute = promisify(execFile);
describe('OPC UA cold certificate initialization', function () {
    this.timeout(30000);
    it('initializes shared PKI before concurrent endpoint connections', async function () {
        const home = await mkdtemp(`${tmpdir()}/scada-pki-`);
        const script = `import source from './src/infrastructure/opcua/source.js';
            const errors = [];
            const runtime = source([19997,19998].map(port => ({url:'opc.tcp://localhost:'+port,
                publishMs:50,heartbeatMs:100,channels:[{nodeId:'ns=1;s=Value'}]})), {accept(){}},
                {retryMs:10000,connectTimeoutMs:100,requestTimeoutMs:100,onError(error){errors.push(error.message);}});
            await runtime.start();
            await new Promise(resolve => setTimeout(resolve,5000));
            await runtime.stop();
            console.log(JSON.stringify(errors));`;
        try {
            const result = await execute(process.execPath, ['--input-type=module', '-e', script],
                { env: { ...process.env, HOME: home }, timeout: 25000 });
            assert.doesNotMatch(result.stdout + result.stderr, /Cannot find private key|cannot locate private key/u);
        } finally { await rm(home, { recursive: true, force: true }); }
    });
});
