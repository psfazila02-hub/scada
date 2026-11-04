function external(config) {
    const mode = config.collectorMode ?? config.env?.COLLECTOR_MODE ?? process.env.COLLECTOR_MODE ?? 'embedded';
    if (!['embedded', 'external'].includes(mode)) { throw new TypeError('Invalid collectorMode'); }
    return mode === 'external';
}
/** Keep site HTTP/state services while moving autonomous ingestion to executors. */
export function collectionEnvironment(config) {
    const env = config.env ?? process.env;
    return external(config) ? { ...env, SINK_PIPELINES: 'false' } : env;
}
export function startCollection(config, start) {
    if (external(config)) { return undefined; }
    return start();
}
