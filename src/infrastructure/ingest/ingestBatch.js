import { boundedBatch } from '@yarkivaev/source-to-sink';

/** Shared production limits; acceptance resolves only after the sink write. */
export default function ingestBatch(sink, config = {}) {
    return boundedBatch(sink, {
        size: config.size ?? 100,
        maxRecords: config.maxRecords ?? 1000,
        maxBytes: config.maxBytes ?? 1048576,
        maxWaitMs: config.maxWaitMs ?? (config.interval ?? 5) * 1000,
        writeTimeoutMs: config.writeTimeoutMs ?? 10000
    });
}
