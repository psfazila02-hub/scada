import assert from 'node:assert/strict';
import collectorProcesses from '../../src/application/deploy/collectorProcesses.js';

const meter = { name: 'meters', command: ['read'], env: { SCALE: '2' }, resources: { cpu: '10m' } };
const thermometer = { name: 'thermals', command: ['poll'], resources: { cpu: '20m' } };
const sources = [
    { name: 'line/power', from: 'bus2', unit: 'kW' },
    { name: 'line/temp', from: 'bus1', unit: 'C' },
    { name: 'line/voltage', from: 'bus2', unit: 'V' }
];

function describeSource(row) { return row.unit === 'C' ? thermometer : { ...meter }; }

function project(descriptor, rows) {
    return { env: { PATHS: rows.map((row) => { return row.name; }).join(',') },
        hostDevices: rows.map((row) => { return row.from; }) };
}

describe('collectorProcesses', () => {
    it('projects equivalent process descriptions together in the order their sources appear', () => {
        assert.deepEqual(collectorProcesses(sources, describeSource, project), [
            { name: 'meters', command: ['read'], env: { SCALE: '2', PATHS: 'line/power,line/voltage' },
                hostDevices: ['bus2'], resources: { cpu: '10m' } },
            { name: 'thermals', command: ['poll'], env: { PATHS: 'line/temp' },
                hostDevices: ['bus1'], resources: { cpu: '20m' } }
        ]);
    });

    it('rejects an unassigned source, duplicate source and conflicting descriptions for one name', () => {
        assert.throws(() => { collectorProcesses(sources, () => { return null; }, project); }, /line\/power/u);
        assert.throws(() => { collectorProcesses([...sources, sources[0]], describeSource, project); }, /duplicate.*line\/power/u);
        assert.throws(() => {
            collectorProcesses(sources, (row) => {
                return { ...describeSource(row), name: 'reader' };
            }, project);
        }, /conflicting.*reader/u);
    });

    it('refuses separate processes claiming one host device', () => {
        const shared = sources.map((row) => { return { ...row, from: 'bus1' }; });
        assert.throws(() => { collectorProcesses(shared, describeSource, project); }, /shared between processes/u);
    });

    it('preserves an optional image override only on the process that declares it', () => {
        const processes = collectorProcesses(sources, (row) => {
            const descriptor = describeSource(row);
            return descriptor.name === 'thermals' ? { ...descriptor, image: 'registry/collector:next' } : descriptor;
        }, project);
        assert.equal(processes[1].image, 'registry/collector:next');
        assert(!Object.hasOwn(processes[0], 'image'));
    });
});
