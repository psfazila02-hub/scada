import { publishedNames } from './publishedStreams.js';
import { isAddress } from './expandPattern.js';
import { asPath, objectPath, serverById } from './releaseNodes.js';

/**
 * Compares two object lists without regard to order.
 *
 * @param {string[]} left - one side
 * @param {string[]} right - the other side
 * @returns {boolean} whether the lists name the same objects
 * @example
 *   sameObjects(['mill/a'], ['mill/a']);
 */
function sameObjects(left, right) {
    const first = left.slice().sort();
    const second = right.slice().sort();
    return first.length === second.length && first.every((item, index) => {
        return item === second[index];
    });
}

/**
 * Records one directed edge, rejecting a disagreeing second side.
 *
 * @param {object[]} edges - accumulated edges
 * @param {object} edge - one side
 * @returns {void}
 * @example
 *   remember([], { from: 'cell', object: 'unit', side: 'out', to: 'archive' });
 */
function remember(edges, edge) {
    let found = edges.find((item) => {
        return item.from === edge.from && item.to === edge.to;
    });
    if (!found) {
        found = { from: edge.from, to: edge.to, sides: {}, streams: new Map() };
        edges.push(found);
    }
    found.sides[edge.side] ||= [];
    const objects = found.sides[edge.side];
    if (!objects.includes(edge.object)) { objects.push(edge.object); }
    const services = found.streams.get(edge.name) || new Set();
    if (edge.api) {
        services.add(edge.api);
        found.api = edge.api;
    }
    found.streams.set(edge.name, services);
}

/**
 * Collects fan-out and server fan-in as one edge list.
 *
 * @param {object} document - expanded document
 * @returns {object[]} directed edges
 * @example
 *   edgesOf({ servers: [] });
 */
export function edgesOf(document) {
    const edges = [];
    (document.servers || []).forEach((server) => {
        (server.fan_out || []).forEach((flow) => {
            const dest = serverById(document, flow.to);
            remember(edges, {
                from: server.id,
                name: flow.name,
                object: objectPath(server, flow.name),
                side: 'out',
                to: dest.id
            });
        });
        (server.fan_in || []).forEach((flow) => {
            if (isAddress(flow.from)) {
                return;
            }
            const source = serverById(document, flow.from);
            remember(edges, {
                api: flow.api,
                from: source.id,
                name: flow.name,
                object: objectPath(source, flow.name),
                side: 'in',
                to: server.id
            });
        });
    });
    edges.forEach((edge) => {
        const left = edge.sides.out;
        const right = edge.sides.in;
        if (left && right && !sameObjects(left, right)) {
            throw new Error(`system document edge from ${edge.from} to ${edge.to} lists different objects`);
        }
        edge.objects = (left || right).slice();
    });
    return edges;
}

/**
 * Reports whether a held path covers an object path.
 *
 * @param {string} held - path the server holds
 * @param {string} objectId - object path
 * @returns {boolean} true when one path covers the other
 * @example
 *   covers('mill/unit/electrical', 'mill/unit');
 */
function covers(held, objectId) {
    return held === objectId || held.startsWith(`${objectId}/`) || objectId.startsWith(`${held}/`);
}

/**
 * Lists telemetry and state paths a server holds directly.
 *
 * @param {object} server - candidate holder
 * @returns {string[]} held paths
 * @example
 *   direct({ fan_in: [], id: 'cell' });
 */
function direct(server) {
    const names = publishedNames(server);
    (server.fan_in || []).forEach((flow) => {
        if (isAddress(flow.from)) {
            names.push(flow.name);
        }
    });
    (server.ownership || []).forEach((entry) => {
        names.push(asPath(entry));
    });
    (server.objects || []).forEach((entry) => {
        names.push(asPath(entry));
    });
    return names;
}

/**
 * Reports whether a server holds an object or receives it from someone who does.
 *
 * @param {object} document - expanded document
 * @param {object[]} edges - directed edges
 * @param {string} serverId - candidate holder
 * @param {string} objectId - object path
 * @param {string[]} stack - servers already visited
 * @returns {boolean} whether the server holds the object
 * @example
 *   holds({ servers: [] }, [], 'cell', 'unit', []);
 */
function holds(document, edges, serverId, objectId, stack) {
    const server = serverById(document, serverId);
    if (direct(server).some((held) => {
        return covers(held, objectId);
    })) {
        return true;
    }
    if (stack.includes(serverId)) {
        throw new Error(`system document cycles ${objectId} at ${serverId}`);
    }
    const incoming = edges.filter((edge) => {
        return edge.to === serverId && edge.objects.includes(objectId);
    });
    const next = stack.concat(serverId);
    return incoming.some((edge) => {
        return holds(document, edges, edge.from, objectId, next);
    });
}

/**
 * Rejects an edge whose source does not hold every listed object.
 *
 * @param {object} document - expanded document
 * @param {object[]} edges - directed edges
 * @returns {void}
 * @example
 *   assertHeld({ servers: [] }, []);
 */
export function assertHeld(document, edges) {
    edges.forEach((edge) => {
        edge.objects.forEach((objectId) => {
            if (!holds(document, edges, edge.from, objectId, [])) {
                throw new Error(`system document server ${edge.from} does not hold ${objectId}`);
            }
        });
    });
}
