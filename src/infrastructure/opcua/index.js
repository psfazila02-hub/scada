import endpoint from './endpoint.js';

function positive(value, name) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new TypeError(`${name} must be a positive number`);
    }
}
function validateChannels(channels) {
    if (!Array.isArray(channels) || channels.length === 0) {
        throw new TypeError('channels must be a nonempty array');
    }
    const nodes = new Set();
    channels.forEach(({ nodeId }) => {
        if (typeof nodeId !== 'string' || !nodeId.trim() || nodes.has(nodeId)) {
            throw new TypeError('invalid or duplicate nodeId');
        }
        nodes.add(nodeId);
    });
}

function validUrl(value) {
    const url = new URL(value);
    return url.protocol === 'opc.tcp:' && Boolean(url.hostname) && !url.username && !url.password;
}
export function validateConnections(connections) {
    if (!Array.isArray(connections)) {
        throw new TypeError('connections must be an array');
    }
    const urls = new Set();
    connections.forEach((connection) => {
        if (typeof connection.url !== 'string' || !validUrl(connection.url) || urls.has(connection.url)) {
            throw new TypeError('invalid or duplicate OPC UA URL');
        }
        urls.add(connection.url);
        positive(connection.publishMs, 'publishMs');
        positive(connection.heartbeatMs, 'heartbeatMs');
        validateChannels(connection.channels);
    });
    return connections;
}
/** Independent OPC UA endpoints. Channel metadata is passed unchanged to publish. */
export default function opcuaConnections(connections, publish, options = {}) {
    const settings = { retryMs: 1000, connectTimeoutMs: 5000, requestTimeoutMs: 5000, ...options };
    validateConnections(connections);
    if (typeof publish !== 'function') {
        throw new TypeError('publish must be a function');
    }
    ['retryMs', 'connectTimeoutMs', 'requestTimeoutMs'].forEach((name) => { positive(settings[name], name); });
    const endpoints = connections.map((connection) => { return endpoint(connection, publish, settings); });
    let stopping = Promise.resolve();
    let revision = 0;
    return {
        async start() {
            revision += 1;
            const requested = revision;
            await stopping;
            if (requested === revision) {
                endpoints.forEach((item) => { item.start(); });
            }
        },
        stop() {
            revision += 1;
            stopping = Promise.all(endpoints.map((item) => { return item.stop(); }));
            return stopping;
        }
    };
}
