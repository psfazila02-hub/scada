import { picked, zipped } from './expandPattern.js';

/**
 * Reads an object entry as a path.
 *
 * @param {string|object} entry - object path or record
 * @returns {string} path
 * @example
 *   asPath('mill/unit');
 */
function asPath(entry) {
    if (typeof entry === 'string' && entry.length > 0) {
        return entry;
    }
    if (entry && typeof entry.id === 'string' && entry.id.length > 0) {
        return entry.id;
    }
    throw new Error('system document object path is empty');
}

/**
 * Rejects a flow name that is only an object path.
 *
 * @param {Array<string|object>} objects - server objects
 * @param {string} path - flow name
 * @returns {void}
 * @example
 *   assertLeaf(['mill/unit'], 'mill/unit/electrical');
 */
export function assertLeaf(objects, path) {
    const listed = (objects || []).map((entry) => {
        return asPath(entry);
    });
    if (listed.includes(path)) {
        throw new Error(`system document flow name ${path} is an object path`);
    }
}

/**
 * Expands object patterns to namespace paths.
 *
 * @param {Array<string|object>|undefined} entries - declared objects
 * @param {string[]} paths - namespace paths
 * @returns {Array<string|object>} concrete objects
 * @example
 *   expandObjects(['mill/*'], ['mill/unit']);
 */
export function expandObjects(entries, paths) {
    return (entries || []).flatMap((entry) => {
        return picked(asPath(entry), paths, 'path', true).map((path) => {
            if (typeof entry === 'string') {
                return path;
            }
            return { ...entry, id: path };
        });
    });
}

/**
 * Copies a mapping id or an inline map onto one flow.
 *
 * @param {object} flow - one flow
 * @param {string[]} paths - namespace paths
 * @param {object} mappings - shared point maps
 * @returns {object} flow with a concrete map
 * @example
 *   withMapping({ mapping: 'drive', name: 'mill/electrical' }, [], {});
 */
function withMapping(flow, paths, mappings) {
    if (!Object.hasOwn(flow, 'mapping')) {
        return flow;
    }
    const token = flow.mapping;
    const resolved = typeof token === 'string' ? mappings[token] : token;
    if (!resolved || typeof resolved !== 'object' || Array.isArray(resolved)) {
        const label = typeof token === 'string' ? token : 'inline';
        throw new Error(`system document has no mapping ${label}`);
    }
    Object.keys(resolved).forEach((key) => {
        if (!paths.includes(`${flow.name}/${key}`)) {
            throw new Error(`system document mapping key ${key} is not under ${flow.name}`);
        }
    });
    return { ...flow, mapping: { ...resolved } };
}

/**
 * Pairs device addresses with expanded names.
 *
 * A fixed address is repeated. Brace groups of equal length zip together.
 *
 * @param {string[]} origins - expanded addresses
 * @param {string[]} names - expanded names
 * @returns {{from: string, name: string}[]} pairs
 * @example
 *   paired(['modbus://192.0.2.10:502'], ['mill/a', 'mill/b']);
 */
function paired(origins, names) {
    if (origins.length === 1) {
        return names.map((name) => {
            return { from: origins[0], name };
        });
    }
    if (names.length === 1) {
        return origins.map((from) => {
            return { from, name: names[0] };
        });
    }
    if (origins.length !== names.length) {
        throw new Error('system document braces differ in length');
    }
    return origins.map((from, index) => {
        return { from, name: names[index] };
    });
}

/**
 * Expands one device fan-in against the namespace.
 *
 * @param {object} flow - device flow
 * @param {string[]} paths - namespace paths
 * @param {object} mappings - shared point maps
 * @param {Array<string|object>} objects - server objects
 * @returns {object[]} concrete flows
 * @example
 *   deviceFlows({ from: 'modbus://192.0.2.10:502', name: 'mill/*' }, ['mill/a'], {}, []);
 */
export function deviceFlows(flow, paths, mappings, objects) {
    const names = picked(flow.name, paths, 'path', true);
    const origins = zipped(flow.from);
    return paired(origins, names).map((pair) => {
        assertLeaf(objects, pair.name);
        return withMapping({ ...flow, from: pair.from, name: pair.name }, paths, mappings);
    });
}
