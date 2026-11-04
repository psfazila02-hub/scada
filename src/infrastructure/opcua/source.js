import { positive, validateConnections } from './config.js';
export { validateConnections } from './config.js';

/** Independent OPC UA endpoints delivering opaque channel metadata and values. */
export default function opcuaSource(connections, collector, options = {}) {
    const settings = { retryMs: 1000, connectTimeoutMs: 5000, requestTimeoutMs: 5000, deliveryTimeoutMs: 5000, maxPending: 100, maxPendingBytes: 1048576, ...options };
    validateConnections(connections);
    if (!collector || typeof collector.accept !== 'function') {
        throw new TypeError('Collector must have an accept() method');
    }
    ['retryMs', 'connectTimeoutMs', 'requestTimeoutMs', 'deliveryTimeoutMs', 'maxPending', 'maxPendingBytes'].forEach((name) => { positive(settings[name], name); });
    if (!Number.isSafeInteger(settings.maxPending)) { throw new TypeError('maxPending must be a safe integer'); }
    let endpoints;
    let stopping = Promise.resolve();
    let revision = 0;
    return {
        async start() {
            revision += 1;
            const requested = revision;
            await stopping;
            // Importing the package or validating a factory never loads node-opcua.
            const { default: endpoint } = await import('./endpoint.js');
            const { default: certificates } = await import('./certificates.js');
            await certificates();
            if (requested === revision) {
                endpoints ??= connections.map((connection) => {
                    return endpoint(connection, (channel, value, context) => { return collector.accept({ channel, value }, context); }, settings);
                });
                endpoints.forEach((item) => { item.start(); });
            }
        },
        stop() {
            revision += 1;
            stopping = Promise.all((endpoints ?? []).map((item) => { return item.stop(); }));
            return stopping;
        }
    };
}
