import assert from 'node:assert';
import mergeDocuments from '../../src/application/deploy/mergeDocuments.js';

function token() {
    return `t${Math.random().toString(36).slice(2, 7)}\u00e9`;
}

describe('mergeDocuments', function() {
    it('keeps the catalog and replaces the servers', function() {
        const signal = token();
        const merged = mergeDocuments(
            {
                mappings: { drive: { voltage: signal } },
                servers: [{ id: 'cell' }]
            },
            { servers: [{ id: 'lab' }] }
        );
        assert.deepStrictEqual(
            {
                map: merged.mappings.drive.voltage,
                servers: merged.servers.map((server) => {
                    return server.id;
                })
            },
            { map: signal, servers: ['lab'] },
            'mergeDocuments dropped the catalog or kept the old servers'
        );
    });

    it('drops a null app on the overlay', function() {
        const image = `example.invalid/plant:${token()}`;
        const merged = mergeDocuments(
            {
                profiles: {
                    archive: {
                        apps: {
                            scada: { image: 'example.invalid/old:1', secret: 'pg' },
                            wms: { chart: 'wms' }
                        }
                    }
                }
            },
            {
                profiles: {
                    archive: {
                        apps: {
                            scada: { image },
                            wms: null
                        }
                    }
                }
            }
        );
        assert.deepStrictEqual(
            merged.profiles.archive.apps,
            { scada: { image, secret: 'pg' } },
            'mergeDocuments kept a null app or dropped the secret'
        );
    });
});
