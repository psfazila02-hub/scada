import endpoint from './endpoint.js';

import { positive, validateConnections } from './config.js';
export { validateConnections } from './config.js';

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
