/** A wildcard occupies exactly one whole path component. */
function matches(pattern, name) {
    const wanted = pattern.split('/');
    const actual = name.split('/');
    return wanted.length === actual.length && wanted.every((part, index) => {
        return part === '*' || part === actual[index];
    });
}

/** Claims sources for one process, rejecting ambiguous routing. */
function claim(machines, group, claimed) {
    const rows = machines.filter((row) => { return matches(group.match, row.name); });
    if (!rows.length) { throw new Error(`empty collector ${group.name}`); }
    rows.forEach((row) => {
        if (claimed.has(row.name)) { throw new Error(`duplicate collector for ${row.name}`); }
        claimed.add(row.name);
    });
    return rows;
}

/**
 * Groups source rows using the deployment's named collectors, in declaration order.
 * project(group, rows) supplies adapter-specific env and optional hostDevices.
 * A physical device may appear in many source rows but belongs to only one process.
 */
export default function collectorProcesses(machines, config, project) {
    const names = config.processGroups.map((group) => { return group.name; });
    if (new Set(names).size !== names.length) { throw new Error('duplicate process name'); }
    const claimed = new Set();
    const devices = new Set();
    const processes = config.processGroups.map((group) => {
        const settings = project(group, claim(machines, group, claimed));
        const hostDevices = [...new Set(settings.hostDevices || [])].sort();
        hostDevices.forEach((device) => {
            if (devices.has(device)) { throw new Error(`serial port or device ${device} is shared between processes`); }
            devices.add(device);
        });
        return { name: group.name, command: group.command, env: { ...group.env, ...settings.env },
            hostDevices, resources: group.resources || config.processDefaults?.resources };
    });
    if (claimed.size !== machines.length) { throw new Error('unassigned sources'); }
    return processes;
}
