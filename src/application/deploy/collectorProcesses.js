import { isDeepStrictEqual } from 'node:util';

/** Group rows in first-seen order, keeping source order within each process. */
function grouped(machines, describe) {
    const groups = new Map();
    const claimed = new Set();
    for (const row of machines) {
        if (claimed.has(row.name)) { throw new Error(`duplicate source ${row.name}`); }
        claimed.add(row.name);
        const descriptor = describe(row);
        if (typeof descriptor?.name !== 'string' || !descriptor.name.trim()) {
            throw new Error(`unassigned source ${row.name}`);
        }
        const group = groups.get(descriptor.name) || { descriptor, rows: [] };
        if (!isDeepStrictEqual(group.descriptor, descriptor)) {
            throw new Error(`conflicting descriptions for process ${descriptor.name}`);
        }
        group.rows.push(row);
        groups.set(descriptor.name, group);
    }
    return [...groups.values()];
}

/**
 * describe(row) returns a process descriptor with a name, command and optional
 * env and resources. All sources describing the same process must agree.
 * project(descriptor, rows) supplies adapter-specific env and optional hostDevices.
 * A physical device may appear in many source rows but belongs to only one process.
 */
export default function collectorProcesses(machines, describe, project) {
    const devices = new Set();
    return grouped(machines, describe).map(({ descriptor, rows }) => {
        const settings = project(descriptor, rows);
        const hostDevices = [...new Set(settings.hostDevices || [])].sort();
        hostDevices.forEach((device) => {
            if (devices.has(device)) { throw new Error(`serial port or device ${device} is shared between processes`); }
            devices.add(device);
        });
        return { name: descriptor.name, command: descriptor.command, env: { ...descriptor.env, ...settings.env },
            hostDevices, resources: descriptor.resources };
    });
}
