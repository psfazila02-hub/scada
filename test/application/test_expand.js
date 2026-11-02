import assert from 'node:assert';
import expand from '../../src/application/deploy/expand.js';

function token() {
    return `t${Math.random().toString(36).slice(2, 7)}\u00e9`;
}

describe('expand', function() {
    it('applies a template as the children of a node', function() {
        const root = token();
        const child = token();
        const expanded = expand({
            namespace: [{ id: root, nodes: [{ id: child, template: 'unit' }] }],
            templates: { unit: [{ id: 'electrical', nodes: [{ id: 'voltage' }] }] }
        });
        assert.deepStrictEqual(
            expanded.namespace[0].nodes[0].nodes,
            [{ id: 'electrical', nodes: [{ id: 'voltage' }] }],
            'expand left the template unapplied'
        );
    });

    it('adds a patch id the template does not have', function() {
        const added = token();
        const expanded = expand({
            namespace: [{
                id: token(),
                nodes: [{ id: added }],
                template: 'unit'
            }],
            templates: { unit: [{ id: 'electrical' }] }
        });
        assert.deepStrictEqual(
            expanded.namespace[0].nodes.map((node) => {
                return node.id;
            }),
            ['electrical', added],
            'expand dropped a patch id the template does not have'
        );
    });

    it('removes a patched id marked disabled', function() {
        const expanded = expand({
            namespace: [{
                id: token(),
                nodes: [{ enabled: false, id: 'step' }],
                template: 'unit'
            }],
            templates: { unit: [{ id: 'voltage' }, { id: 'step' }] }
        });
        assert.deepStrictEqual(
            expanded.namespace[0].nodes.map((node) => {
                return node.id;
            }),
            ['voltage'],
            'expand kept a patched id marked disabled'
        );
    });

    it('patches a child list the same way', function() {
        const expanded = expand({
            namespace: [{
                id: token(),
                nodes: [{ id: 'electrical', nodes: [{ enabled: false, id: 'step' }] }],
                template: 'unit'
            }],
            templates: { unit: [{ id: 'electrical', nodes: [{ id: 'voltage' }, { id: 'step' }] }] }
        });
        assert.deepStrictEqual(
            expanded.namespace[0].nodes[0].nodes,
            [{ id: 'voltage' }],
            'expand left a nested patch unapplied'
        );
    });

    it('rejects a repeated patch id', function() {
        const repeated = token();
        assert.throws(
            () => {
                return expand({
                    namespace: [{
                        id: token(),
                        nodes: [{ id: repeated }, { id: repeated }],
                        template: 'unit'
                    }],
                    templates: { unit: [{ id: 'electrical' }] }
                });
            },
            'expand accepted a repeated patch id'
        );
    });

    it('copies a named mapping onto the flow', function() {
        const point = `holding:${Math.floor(Math.random() * 4000)}`;
        const root = token();
        const expanded = expand({
            mappings: { drive: { voltage: point } },
            namespace: [{ id: root, nodes: [{ id: 'electrical', nodes: [{ id: 'voltage' }] }] }],
            profiles: { cell: {} },
            servers: [{
                fan_in: [{
                    from: 'modbus://192.0.2.11:502',
                    mapping: 'drive',
                    name: `${root}/electrical`
                }],
                id: 'cell',
                profile: { id: 'cell' }
            }]
        });
        assert.deepStrictEqual(
            expanded.servers[0].fan_in[0].mapping,
            { voltage: point },
            'expand left the mapping id unresolved'
        );
    });

    it('rejects an unknown mapping id', function() {
        const missing = token();
        const root = token();
        assert.throws(
            () => {
                return expand({
                    mappings: {},
                    namespace: [{ id: root, nodes: [{ id: 'electrical' }] }],
                    profiles: { cell: {} },
                    servers: [{
                        fan_in: [{
                            from: 'modbus://192.0.2.12:502',
                            mapping: missing,
                            name: `${root}/electrical`
                        }],
                        id: 'cell',
                        profile: { id: 'cell' }
                    }]
                });
            },
            'expand accepted an unknown mapping id'
        );
    });

    it('rejects a mapping key that is not under the flow name', function() {
        const root = token();
        const stray = token();
        assert.throws(
            () => {
                return expand({
                    mappings: { drive: { [stray]: 'coil:1' } },
                    namespace: [{ id: root, nodes: [{ id: 'electrical', nodes: [{ id: 'voltage' }] }] }],
                    profiles: { cell: {} },
                    servers: [{
                        fan_in: [{
                            from: 'modbus://192.0.2.13:502',
                            mapping: 'drive',
                            name: `${root}/electrical`
                        }],
                        id: 'cell',
                        profile: { id: 'cell' }
                    }]
                });
            },
            'expand accepted a mapping key that is not under the flow name'
        );
    });

    it('expands brace alternatives under one fixed source', function() {
        const left = token();
        const right = token();
        const address = `modbus://192.0.2.${Math.floor(Math.random() * 200) + 1}:502`;
        const expanded = expand({
            namespace: [
                { id: 'mill', nodes: [{ id: left, nodes: [{ id: 'electrical' }] }] },
                { id: 'mill', nodes: [{ id: right, nodes: [{ id: 'electrical' }] }] }
            ],
            profiles: { cell: {} },
            servers: [{
                fan_in: [{ from: address, name: `mill/{${left},${right}}/electrical` }],
                id: 'cell',
                profile: { id: 'cell' }
            }]
        });
        assert.deepStrictEqual(
            expanded.servers[0].fan_in.map((flow) => {
                return { from: flow.from, name: flow.name };
            }),
            [
                { from: address, name: `mill/${left}/electrical` },
                { from: address, name: `mill/${right}/electrical` }
            ],
            'expand failed to repeat the fixed source for each brace alternative'
        );
    });

    it('expands brace groups in one path together', function() {
        const expanded = expand({
            namespace: [
                { id: 'mill', nodes: [{ id: 'east', nodes: [{ id: 'alpha' }, { id: 'beta' }] }] },
                { id: 'mill', nodes: [{ id: 'west', nodes: [{ id: 'alpha' }, { id: 'beta' }] }] }
            ],
            profiles: { cell: {} },
            servers: [{
                fan_in: [{
                    from: 'modbus://192.0.2.14:502',
                    name: 'mill/{east,west}/{alpha,beta}'
                }],
                id: 'cell',
                profile: { id: 'cell' }
            }]
        });
        assert.deepStrictEqual(
            expanded.servers[0].fan_in.map((flow) => {
                return flow.name;
            }),
            ['mill/east/alpha', 'mill/west/beta'],
            'expand crossed brace groups instead of expanding them together'
        );
    });

    it('lets a star match the rest of a path including a slash', function() {
        const expanded = expand({
            namespace: [{
                id: 'mill',
                nodes: [{ id: 'hall', nodes: [{ id: 'unit', nodes: [{ id: 'electrical' }] }] }, { id: 'other' }]
            }],
            profiles: { cell: {} },
            servers: [{
                fan_in: [{ from: 'modbus://192.0.2.15:502', name: 'mill/*' }],
                id: 'cell',
                profile: { id: 'cell' }
            }]
        });
        assert.deepStrictEqual(
            expanded.servers[0].fan_in.map((flow) => {
                return flow.name;
            }),
            ['mill/hall', 'mill/hall/unit', 'mill/hall/unit/electrical', 'mill/other'],
            'expand refused a star match that contains a slash'
        );
    });

    it('keeps a fan-out star to streams the server already has', function() {
        const expanded = expand({
            namespace: [{
                id: 'mill',
                nodes: [
                    { id: 'kept', nodes: [{ id: 'voltage' }] },
                    { id: 'other', nodes: [{ id: 'pressure' }] }
                ]
            }],
            profiles: { cell: {}, archive: {} },
            servers: [
                {
                    fan_in: [{ from: 'modbus://192.0.2.16:502', name: 'mill/kept/voltage' }],
                    fan_out: [{ name: 'mill/*', to: 'archive' }],
                    id: 'cell',
                    profile: { id: 'cell' }
                },
                { id: 'archive', profile: { id: 'archive' } }
            ]
        });
        assert.deepStrictEqual(
            expanded.servers[0].fan_out.map((flow) => {
                return flow.name;
            }),
            ['mill/kept/voltage'],
            'expand added a namespace path the server does not already stream'
        );
    });

    it('keeps a parent profile module on an extending profile', function() {
        const expanded = expand({
            profiles: {
                cell: { modules: { state_store: { enabled: true } } },
                external: { extends: 'cell' }
            }
        });
        assert.strictEqual(
            expanded.profiles.external.modules.state_store.enabled,
            true,
            'expand dropped a parent profile module'
        );
    });

    it('lets a child command replace the parent command', function() {
        const command = ['node', `bin/${token()}.js`];
        const expanded = expand({
            profiles: {
                cell: { command: ['node', 'bin/parent.js'] },
                external: { command, extends: 'cell' }
            }
        });
        assert.deepStrictEqual(
            expanded.profiles.external.command,
            command,
            'expand kept the parent command'
        );
    });

    it('lets a child app replace that one parent app', function() {
        const image = `example.invalid/hmi:${token()}`;
        const kept = `example.invalid/plant:${token()}`;
        const expanded = expand({
            profiles: {
                cell: { apps: { frontend: { image: 'example.invalid/hmi:0' }, scada: { image: kept } } },
                external: { apps: { frontend: { image } }, extends: 'cell' }
            }
        });
        assert.deepStrictEqual(
            expanded.profiles.external.apps,
            { frontend: { image }, scada: { image: kept } },
            'expand failed to replace one child app and keep the others'
        );
    });

    it('lets a child variable replace the parent variable', function() {
        const cluster = token();
        const expanded = expand({
            profiles: {
                cell: { variables: { cluster: null } },
                external: { extends: 'cell', variables: { cluster } }
            }
        });
        assert.strictEqual(
            expanded.profiles.external.variables.cluster,
            cluster,
            'expand kept the parent variable'
        );
    });

    it('rejects an unknown server', function() {
        const missing = token();
        const root = token();
        assert.throws(
            () => {
                return expand({
                    namespace: [{ id: root }],
                    profiles: { cell: {} },
                    servers: [{
                        fan_in: [{ from: 'modbus://192.0.2.17:502', name: root }],
                        fan_out: [{ name: root, to: missing }],
                        id: 'cell',
                        profile: { id: 'cell' }
                    }]
                });
            },
            'expand accepted an unknown server'
        );
    });

    it('takes each matching servers own outgoing names', function() {
        const alpha = token();
        const beta = token();
        const expanded = expand({
            namespace: [{ id: alpha }, { id: beta }],
            profiles: { cell: {}, hub: {} },
            servers: [
                {
                    fan_in: [{ from: 'modbus://192.0.2.18:502', name: alpha }],
                    fan_out: [{ name: '*', to: 'hub' }],
                    id: 'cell-a',
                    profile: { id: 'cell' }
                },
                {
                    fan_in: [{ from: 'modbus://192.0.2.19:502', name: beta }],
                    fan_out: [{ name: '*', to: 'hub' }],
                    id: 'cell-b',
                    profile: { id: 'cell' }
                },
                {
                    fan_in: [{ from: 'cell-*', name: '*' }],
                    id: 'hub',
                    profile: { id: 'hub' }
                }
            ]
        });
        assert.deepStrictEqual(
            expanded.servers[2].fan_in.map((flow) => {
                return { from: flow.from, name: flow.name };
            }),
            [{ from: 'cell-a', name: alpha }, { from: 'cell-b', name: beta }],
            'expand paired every server with every name'
        );
    });

    it('rejects a flow path the namespace does not list', function() {
        const missing = token();
        assert.throws(
            () => {
                return expand({
                    namespace: [{ id: token() }],
                    profiles: { cell: {} },
                    servers: [{
                        fan_in: [{ from: 'modbus://192.0.2.20:502', name: missing }],
                        id: 'cell',
                        profile: { id: 'cell' }
                    }]
                });
            },
            'expand accepted a flow path the namespace does not list'
        );
    });
});
