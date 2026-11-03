import assert from 'node:assert/strict';
import { expand, subscriptions } from '../../index.js';

function topology() {
    return {
        namespace: [{ id: 'unit', nodes: [{ id: 'pressure' }, { id: 'speed' }] }],
        profiles: { common: {} },
        servers: [
            { id: 'reader', profile: { id: 'common' }, objects: ['unit'],
                fan_in: [{ from: 'modbus://192.0.2.1:502', name: 'unit/{pressure,speed}' }],
                fan_out: [{ to: 'west', name: 'unit/*' }, { to: 'east', name: 'unit/speed' }],
                api: [{ id: 'bus', url: 'amqp://192.0.2.1' }] },
            { id: 'west', profile: { id: 'common' }, fan_in: [{ from: 'reader', name: 'unit/*', api: 'bus' }] },
            { id: 'east', profile: { id: 'common' } },
            { id: 'south', profile: { id: 'common' }, fan_in: [{ from: 'reader', name: 'unit/speed', api: 'bus' }] }
        ]
    };
}

describe('subscriptions', () => {
    it('deduplicates either side of an expanded stream link without collapsing leaf paths', () => {
        const rows = subscriptions(expand(topology()), 'reader');
        assert.deepEqual(rows, [
            { from: 'reader', to: 'west', name: 'unit/pressure', api: 'bus' },
            { from: 'reader', to: 'west', name: 'unit/speed', api: 'bus' },
            { from: 'reader', to: 'east', name: 'unit/speed' },
            { from: 'reader', to: 'south', name: 'unit/speed', api: 'bus' }
        ]);
    });

    it('drops a removed subscription while retaining the destinations still requesting the stream', () => {
        const document = topology();
        document.servers[3].fan_in = [];
        document.servers[0].fan_out = [];
        const rows = subscriptions(expand(document), 'reader');
        assert.deepEqual(rows.map((row) => { return [row.to, row.name]; }), [
            ['west', 'unit/pressure'], ['west', 'unit/speed']
        ]);
        assert.deepEqual(subscriptions(expand(document), 'west'), []);
    });
});

describe('published API streams', () => {
    function system() {
        const document = topology();
        const [source, west, east, south] = document.servers;
        document.namespace[0].nodes.push({ id: 'status' });
        source.api[0].publishes = [{ name: 'unit/{speed,status}', contract: 'events' }];
        source.api.push({ id: 'plant', url: 'http://192.0.2.1' });
        source.fan_out = [{ to: 'east', name: 'unit/status' }];
        west.fan_in[0].api = 'plant';
        south.fan_in[0].name = 'unit/*';
        east.fan_in = [];
        return document;
    }

    it('expands published names for the selected API without duplicating a local reading', () => {
        const document = expand(system());
        const [source, west, , south] = document.servers;
        assert.deepEqual(source.api[0].publishes, [
            { name: 'unit/speed', contract: 'events' }, { name: 'unit/status', contract: 'events' }
        ]);
        assert.deepEqual(source.fan_in.map(({ name }) => { return name; }), ['unit/pressure', 'unit/speed']);
        assert.deepEqual(west.fan_in.map(({ name }) => { return name; }), ['unit/pressure', 'unit/speed']);
        assert.deepEqual(south.fan_in.map(({ name }) => { return name; }), ['unit/pressure', 'unit/speed', 'unit/status']);
        assert(subscriptions(document, 'reader').some((row) => { return row.to === 'east' && row.name === 'unit/status'; }));
    });

    it('rejects a passive path requested through another API by its exact name', () => {
        const document = system();
        document.servers[1].fan_in[0].name = 'unit/status';
        assert.throws(() => { expand(document); }, /unit\/status.*plant/u);
    });

    it('requires an API name when the source offers multiple services', () => {
        const document = system();
        delete document.servers[1].fan_in[0].api;
        assert.throws(() => { expand(document); }, /must name one api/u);
    });

    it('includes passive-only streams when the sole API is implicit', () => {
        const document = system();
        const [source, west] = document.servers;
        source.objects = [];
        source.api.pop();
        delete west.fan_in[0].api;
        assert(subscriptions(expand(document), 'reader').some((row) => {
            return row.to === 'west' && row.name === 'unit/status';
        }));
    });
});
