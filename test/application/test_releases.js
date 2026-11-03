import assert from 'node:assert';
import releases from '../../src/application/deploy/releases.js';

function token() {
    return `t${Math.random().toString(36).slice(2, 7)}\u00e9`;
}

function image() {
    return `example.invalid/plant:${token()}`;
}

describe('releases', function() {
    it('gives the receiver the objects a fan-out sends', function() {
        const machine = token();
        const signal = token();
        const url = `http://192.0.2.${Math.floor(Math.random() * 200) + 1}:30300/api/v1`;
        const cut = releases({
            namespace: [{ id: machine, nodes: [{ id: signal }] }],
            profiles: {
                archive: { apps: { scada: { image: image() } } },
                cell: { apps: { scada: { image: image() } } }
            },
            servers: [
                {
                    api: [{ id: 'plant', url }],
                    fan_in: [{ from: 'modbus://192.0.2.9:502', name: `${machine}/${signal}` }],
                    fan_out: [{ name: `${machine}/${signal}`, to: 'archive' }],
                    id: 'cell',
                    objects: [machine],
                    profile: { id: 'cell', variables: { cluster: 'cell' } }
                },
                {
                    id: 'archive',
                    profile: { id: 'archive', variables: { cluster: 'archive' } }
                }
            ]
        }, 'archive');
        assert.deepStrictEqual(
            cut.scada.sites,
            [{ baseUrl: url, machines: [machine] }],
            'releases dropped the fan-out route on the receiver'
        );
    });

    it('keeps fan-out off the sender release', function() {
        const machine = token();
        const signal = token();
        const cut = releases({
            namespace: [{ id: machine, nodes: [{ id: signal }] }],
            profiles: {
                archive: { apps: { scada: { image: image() } } },
                cell: { apps: { scada: { image: image() } } }
            },
            servers: [
                {
                    fan_in: [{ from: 'modbus://192.0.2.9:502', name: `${machine}/${signal}` }],
                    fan_out: [{ name: `${machine}/${signal}`, to: 'archive' }],
                    id: 'cell',
                    objects: [machine],
                    profile: { id: 'cell', variables: { cluster: 'cell' } }
                },
                {
                    api: [{ id: 'bus', url: 'stomp://192.0.2.40:61613' }],
                    id: 'archive',
                    profile: { id: 'archive', variables: { cluster: 'archive' } }
                }
            ]
        }, 'cell');
        assert.strictEqual(cut.scada.sites, undefined, 'releases copied fan-out onto the sender');
    });

    it('publishes local fan-in and leaves ownership out of it', function() {
        const meter = token();
        const state = token();
        const cut = releases({
            namespace: [{ id: meter }],
            profiles: { cell: { apps: { scada: { image: image() } } } },
            servers: [{
                fan_in: [{ from: 'modbus://192.0.2.8:502', name: meter }],
                id: 'cell',
                ownership: [{ id: state }],
                profile: { id: 'cell', variables: { cluster: 'cell' } }
            }]
        }, 'cell');
        assert.deepStrictEqual(
            cut.scada.machines.map((item) => {
                return item.name;
            }),
            [meter],
            'releases published editable state as telemetry'
        );
    });

    it('installs the telemetry store only when that module is enabled', function() {
        const cut = releases({
            profiles: {
                archive: {
                    apps: { scada: { image: image() } },
                    modules: { telemetry_store: { enabled: true } }
                }
            },
            servers: [{
                id: 'archive',
                profile: { id: 'archive', variables: { cluster: 'archive' } }
            }]
        }, 'archive');
        assert.strictEqual(
            cut.scada.clickhouse.enabled,
            true,
            'releases left the telemetry store disabled'
        );
    });

    it('leaves another profiles apps off this release', function() {
        const cut = releases({
            profiles: {
                archive: {
                    apps: {
                        frontend: { image: 'example.invalid/hmi:1' },
                        scada: { image: image() }
                    }
                },
                cell: { apps: { scada: { image: image() } } }
            },
            servers: [
                { id: 'cell', profile: { id: 'cell', variables: { cluster: 'cell' } } },
                { id: 'archive', profile: { id: 'archive', variables: { cluster: 'archive' } } }
            ]
        }, 'cell');
        assert.deepStrictEqual(cut.apps, [], 'releases delivered an app from another profile');
    });

    it('rejects an edge whose two sides list different objects', function() {
        const machine = token();
        const other = token();
        const signal = token();
        assert.throws(
            () => {
                return releases({
                    namespace: [
                        { id: machine, nodes: [{ id: signal }] },
                        { id: other, nodes: [{ id: signal }] }
                    ],
                    profiles: {
                        archive: { apps: { scada: { image: image() } } },
                        cell: { apps: { scada: { image: image() } } }
                    },
                    servers: [
                        {
                            api: [{ id: 'plant', url: 'http://192.0.2.14:30300/api/v1' }],
                            fan_in: [{ from: 'modbus://192.0.2.9:502', name: `${machine}/${signal}` }],
                            fan_out: [{ name: `${machine}/${signal}`, to: 'archive' }],
                            id: 'cell',
                            objects: [machine],
                            profile: { id: 'cell', variables: { cluster: 'cell' } }
                        },
                        {
                            fan_in: [{ api: 'plant', from: 'cell', name: `${other}/${signal}` }],
                            id: 'archive',
                            profile: { id: 'archive', variables: { cluster: 'archive' } }
                        }
                    ]
                }, 'archive');
            },
            'releases accepted an edge whose sides disagree'
        );
    });

    it('accepts an edge whose two sides list the same objects', function() {
        const first = token();
        const second = token();
        const signal = token();
        const url = `http://192.0.2.${Math.floor(Math.random() * 200) + 1}:30300/api/v1`;
        const cut = releases({
            namespace: [
                { id: first, nodes: [{ id: signal }] },
                { id: second, nodes: [{ id: signal }] }
            ],
            profiles: {
                archive: { apps: { scada: { image: image() } } },
                cell: { apps: { scada: { image: image() } } }
            },
            servers: [
                {
                    api: [{ id: 'plant', url }],
                    fan_in: [
                        { from: 'modbus://192.0.2.9:502', name: `${first}/${signal}` },
                        { from: 'modbus://192.0.2.9:502', name: `${second}/${signal}` }
                    ],
                    fan_out: [
                        { name: `${first}/${signal}`, to: 'archive' },
                        { name: `${second}/${signal}`, to: 'archive' }
                    ],
                    id: 'cell',
                    objects: [first, second],
                    profile: { id: 'cell', variables: { cluster: 'cell' } }
                },
                {
                    fan_in: [
                        { api: 'plant', from: 'cell', name: `${first}/${signal}` },
                        { api: 'plant', from: 'cell', name: `${second}/${signal}` }
                    ],
                    id: 'archive',
                    profile: { id: 'archive', variables: { cluster: 'archive' } }
                }
            ]
        }, 'archive');
        assert.deepStrictEqual(
            cut.scada.sites,
            [{ baseUrl: url, machines: [first, second] }],
            'releases dropped one object of a matching two-sided edge'
        );
    });

    it('copies the object a local flow names', function() {
        const machine = token();
        const signal = token();
        const cut = releases({
            namespace: [{ id: machine, nodes: [{ id: signal }] }],
            profiles: { cell: { apps: { scada: { image: image() } } } },
            servers: [{
                fan_in: [{ from: 'modbus://192.0.2.9:502', name: `${machine}/${signal}` }],
                id: 'cell',
                objects: [machine],
                profile: { id: 'cell', variables: { cluster: 'cell' } }
            }]
        }, 'cell');
        assert.strictEqual(cut.scada.machines[0].id, machine, 'releases dropped the named object');
    });

    it('skips a source that publishes no plant api', function() {
        const machine = token();
        const cut = releases({
            namespace: [{ id: machine }],
            profiles: {
                archive: { apps: { scada: { image: image() } } },
                cell: { apps: { scada: { image: image() } } }
            },
            servers: [
                {
                    fan_in: [{ from: 'modbus://192.0.2.9:502', name: machine }],
                    fan_out: [{ name: machine, to: 'archive' }],
                    id: 'cell',
                    profile: { id: 'cell', variables: { cluster: 'cell' } }
                },
                {
                    fan_in: [{ from: 'cell', name: machine }],
                    id: 'archive',
                    profile: { id: 'archive', variables: { cluster: 'archive' } }
                }
            ]
        }, 'archive');
        assert.strictEqual(cut.scada.sites, undefined, 'releases called a source that publishes no plant api');
    });

    it('rejects a cluster the document does not name', function() {
        const cluster = token();
        assert.throws(
            () => {
                return releases({ profiles: {}, servers: [] }, cluster);
            },
            'releases accepted a cluster the document does not name'
        );
    });

    it('reads the scada image from the profile', function() {
        const wanted = image();
        const cut = releases({
            apps: { scada: { image: image() } },
            profiles: { cell: { apps: { scada: { image: wanted } } } },
            servers: [{ id: 'cell', profile: { id: 'cell', variables: { cluster: 'cell' } } }]
        }, 'cell');
        assert.strictEqual(cut.scada.image, wanted, 'releases ignored the profile image');
    });

    it('copies the profile command', function() {
        const command = ['node', `bin/${token()}.js`];
        const cut = releases({
            profiles: { cell: { apps: { scada: { image: image() } }, command } },
            servers: [{ id: 'cell', profile: { id: 'cell', variables: { cluster: 'cell' } } }]
        }, 'cell');
        assert.deepStrictEqual(cut.scada.command, command, 'releases dropped the profile command');
    });

    it('enables postgres from the state store', function() {
        const cut = releases({
            profiles: {
                cell: {
                    apps: { scada: { image: image() } },
                    modules: { state_store: { enabled: true } }
                }
            },
            servers: [{ id: 'cell', profile: { id: 'cell', variables: { cluster: 'cell' } } }]
        }, 'cell');
        assert.strictEqual(cut.scada.postgres.enabled, true, 'releases left the state store disabled');
    });

    it('copies the state store secret', function() {
        const secret = `pg-${token()}`;
        const cut = releases({
            profiles: {
                cell: {
                    apps: { scada: { image: image(), secret } },
                    modules: { state_store: { enabled: true } }
                }
            },
            servers: [{ id: 'cell', profile: { id: 'cell', variables: { cluster: 'cell' } } }]
        }, 'cell');
        assert.strictEqual(cut.scada.postgres.secret, secret, 'releases dropped the state store secret');
    });

    it('disables postgres when the state store is disabled', function() {
        const cut = releases({
            profiles: {
                cell: {
                    apps: { scada: { image: image() } },
                    modules: { state_store: { enabled: false } }
                }
            },
            servers: [{ id: 'cell', profile: { id: 'cell', variables: { cluster: 'cell' } } }]
        }, 'cell');
        assert.strictEqual(cut.scada.postgres.enabled, false, 'releases installed a disabled state store');
    });

    it('disables rabbitmq when the message bus is disabled', function() {
        const cut = releases({
            profiles: {
                cell: {
                    apps: { scada: { image: image() } },
                    modules: { message_bus: { enabled: false } }
                }
            },
            servers: [{ id: 'cell', profile: { id: 'cell', variables: { cluster: 'cell' } } }]
        }, 'cell');
        assert.strictEqual(cut.scada.rabbitmq.enabled, false, 'releases installed a disabled message bus');
    });

    it('copies the server service', function() {
        const nodePort = 30000 + Math.floor(Math.random() * 1000);
        const cut = releases({
            profiles: { cell: { apps: { scada: { image: image() } } } },
            servers: [{
                id: 'cell',
                profile: { id: 'cell', variables: { cluster: 'cell' } },
                service: { nodePort }
            }]
        }, 'cell');
        assert.strictEqual(cut.scada.service.nodePort, nodePort, 'releases dropped the server service');
    });

    it('copies profile env', function() {
        const value = `postgresql://scada@db-${token()}.invalid:5432/scada`;
        const cut = releases({
            profiles: {
                cell: {
                    apps: { scada: { image: image() } },
                    env: [{ name: 'POSTGRES_URL', value }]
                }
            },
            servers: [{ id: 'cell', profile: { id: 'cell', variables: { cluster: 'cell' } } }]
        }, 'cell');
        assert.deepStrictEqual(
            cut.scada.env,
            [{ name: 'POSTGRES_URL', value }],
            'releases dropped profile env'
        );
    });

    it('copies the image pull secret', function() {
        const pullSecret = `pull-${token()}`;
        const cut = releases({
            profiles: { cell: { apps: { scada: { image: image(), pullSecret } } } },
            servers: [{ id: 'cell', profile: { id: 'cell', variables: { cluster: 'cell' } } }]
        }, 'cell');
        assert.strictEqual(cut.scada.pullSecret, pullSecret, 'releases dropped the image pull secret');
    });

    it('emits a bus address for fan-out to another cluster', function() {
        const machine = token();
        const url = `stomp://192.0.2.${Math.floor(Math.random() * 200) + 1}:61613`;
        const cut = releases({
            namespace: [{ id: machine }],
            profiles: {
                archive: { apps: { scada: { image: image() } }, variables: { cluster: 'archive' } },
                cell: { apps: { scada: { image: image() } } }
            },
            servers: [
                {
                    fan_in: [{ from: 'modbus://192.0.2.21:502', name: machine }],
                    fan_out: [{ name: machine, to: 'archive' }],
                    id: 'cell',
                    profile: { id: 'cell', variables: { cluster: 'cell' } }
                },
                {
                    api: [{ id: 'bus', url }],
                    id: 'archive',
                    profile: { id: 'archive' }
                }
            ]
        }, 'cell');
        assert.deepStrictEqual(
            cut.scada.buses,
            [{ names: [machine], url }],
            'releases dropped the bus of a fan-out'
        );
    });

    it('emits profile apps other than scada', function() {
        const front = `example.invalid/hmi:${token()}`;
        const port = 30080 + Math.floor(Math.random() * 10);
        const cut = releases({
            profiles: {
                archive: {
                    apps: {
                        frontend: { image: front, nodePort: port },
                        scada: { image: image() }
                    }
                }
            },
            servers: [{
                id: 'archive',
                profile: { id: 'archive', variables: { cluster: 'archive' } }
            }]
        }, 'archive');
        assert.deepStrictEqual(
            cut.apps,
            [{ image: front, name: 'frontend', nodePort: port }],
            'releases dropped a profile app other than scada'
        );
    });

    it('copies a point map onto a machine', function() {
        const machine = token();
        const point = `holding:${Math.floor(Math.random() * 4000)}`;
        const cut = releases({
            mappings: { drive: { voltage: point } },
            namespace: [{ id: machine, nodes: [{ id: 'electrical', nodes: [{ id: 'voltage' }] }] }],
            profiles: { cell: { apps: { scada: { image: image() } } } },
            servers: [{
                fan_in: [{
                    from: 'modbus://192.0.2.22:502',
                    mapping: 'drive',
                    name: `${machine}/electrical`
                }],
                id: 'cell',
                objects: [machine],
                profile: { id: 'cell', variables: { cluster: 'cell' } }
            }]
        }, 'cell');
        assert.deepStrictEqual(
            cut.scada.machines[0].mapping,
            { voltage: point },
            'releases dropped the point map'
        );
    });

    it('rejects an unknown module', function() {
        const name = `mod-${token()}`;
        assert.throws(
            () => {
                return releases({
                    profiles: {
                        cell: {
                            apps: { scada: { image: image() } },
                            modules: { [name]: { enabled: true } }
                        }
                    },
                    servers: [{ id: 'cell', profile: { id: 'cell', variables: { cluster: 'cell' } } }]
                }, 'cell');
            },
            'releases accepted an unknown module'
        );
    });

    it('rejects a profile with no scada image', function() {
        assert.throws(
            () => {
                return releases({
                    profiles: { cell: { modules: {} } },
                    servers: [{ id: 'cell', profile: { id: 'cell', variables: { cluster: 'cell' } } }]
                }, 'cell');
            },
            'releases accepted a profile with no scada image'
        );
    });
});
