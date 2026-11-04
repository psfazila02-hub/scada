import { resources, sinks, sources } from './streamPorts.js';
import pipelineAdapters from './pipelineAdapters.js';
import additionalAdapters from './additionalAdapters.js';
import streamTask from './streamTask.js';

function extend(base, additions = new Map()) {
    additions.forEach((value, key) => {
        if (base.has(key)) { throw new Error(`duplicate runtime adapter: ${key}`); }
        base.set(key, value);
    });
    return base;
}
/** Same protocol capabilities on every executor; only registered extensions may run. */
export default function createRegistry(options = {}) {
    const ports = { sources: extend(sources(), options.sources), sinks: extend(sinks(), options.sinks), transforms: options.transforms ?? new Map() };
    const stream = streamTask(ports);
    const registry = extend(pipelineAdapters(), additionalAdapters());
    registry.set('stream', { ...stream, resources(spec) { return [...new Set([...resources(spec), ...(spec.resources ?? [])])]; } });
    return extend(registry, options.adapters);
}
