import assert from 'node:assert/strict';
import collectorProcesses from '../../src/application/deploy/collectorProcesses.js';

const sources = [{ name: 'line/temp', from: 'bus1' }, { name: 'line/unit/power', from: 'bus2' }];
const meters = { name: 'meters', match: 'line/*/power', command: ['read'], env: { SCALE: '2' } };
const thermals = { name: 'thermals', match: 'line/*', command: ['poll'], resources: { cpu: '20m' } };

function project(group, rows) {
    return { env: { PATHS: rows.map((row) => { return row.name; }).join(',') },
        hostDevices: rows.map((row) => { return row.from; }) };
}

function processes(rows, groups) {
    return collectorProcesses(rows, { processGroups: groups, processDefaults: { resources: { cpu: '10m' } } }, project);
}

describe('collectorProcesses', () => {
    it('projects each source once, matching whole path components and applying defaults', () => {
        assert.deepEqual(processes(sources, [meters, thermals]), [
            { name: 'meters', command: ['read'], env: { SCALE: '2', PATHS: 'line/unit/power' },
                hostDevices: ['bus2'], resources: { cpu: '10m' } },
            { name: 'thermals', command: ['poll'], env: { PATHS: 'line/temp' },
                hostDevices: ['bus1'], resources: { cpu: '20m' } }
        ]);
    });

    it('refuses overlapping groups, unassigned sources, empty groups and repeated process names', () => {
        const overlap = { ...meters, name: 'other' };
        assert.throws(() => { processes(sources, [meters, overlap]); }, /duplicate collector/u);
        assert.throws(() => { processes(sources, [meters]); }, /unassigned/u);
        assert.throws(() => { processes([], [meters]); }, /empty/u);
        assert.throws(() => { processes(sources, [meters, meters]); }, /duplicate.*name/u);
    });

    it('refuses separate processes claiming one host device', () => {
        const shared = sources.map((row) => { return { ...row, from: 'bus1' }; });
        assert.throws(() => { processes(shared, [thermals, meters]); }, /shared between processes/u);
    });
});
