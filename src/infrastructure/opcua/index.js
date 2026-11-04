import opcuaSource from '@yarkivaev/source-to-sink/src/opcuaSource.js';
export { validateConnections } from '@yarkivaev/source-to-sink/src/opcua/config.js';

/** Compatibility adapter for callback-based SCADA consumers. */
export default function opcuaConnections(connections, publish, options = {}) {
    if (typeof publish !== 'function') { throw new TypeError('publish must be a function'); }
    return opcuaSource(connections, { accept: ({ channel, value }) => { return publish(channel, value); } }, options);
}
