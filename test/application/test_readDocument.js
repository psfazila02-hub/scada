import assert from 'node:assert';
import readDocument from '../../src/application/deploy/readDocument.js';

describe('readDocument', function() {
    it('keeps a nested machine id from a system document', function() {
        const id = `m${Math.random().toString(36).slice(2, 8)}`;
        const document = readDocument([
            'namespace:',
            '  - id: mill',
            '    nodes:',
            `      - id: ${id}`,
            '        kind: unit',
            '        service:',
            '          port: 502'
        ].join('\n'));
        assert.strictEqual(
            document.namespace[0].nodes[0].id,
            id,
            'readDocument dropped the nested machine id'
        );
    });

    it('keeps the flow name beside a from block', function() {
        const point = `holding:${4000 + Math.floor(Math.random() * 20)}:cdab`;
        const document = readDocument([
            'fan_in:',
            '  - from:',
            `      voltage: ${point}`,
            '    name: mill/hall/unit/electrical'
        ].join('\n'));
        assert.strictEqual(
            document.fan_in[0].name,
            'mill/hall/unit/electrical',
            'readDocument dropped the flow name beside a from block'
        );
    });

    it('keeps an edge API URL that contains colons', function() {
        const port = 30000 + Math.floor(Math.random() * 1000);
        const api = `http://192.0.2.9:${port}/api/v1`;
        const document = readDocument([
            'servers:',
            '  - id: edge',
            `    api: ${api}`
        ].join('\n'));
        assert.strictEqual(document.servers[0].api, api, 'readDocument truncated the site API');
    });
});
