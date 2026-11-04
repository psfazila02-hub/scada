import {
    clickhouseSink,
    clock,
    lokiSource
} from '@yarkivaev/source-to-sink';
import ingestBatch from '../ingestBatch.js';
import activityCodec from './activityTransformer.js';

/**
 * Pipeline for streaming Loki HTTP access logs to ClickHouse.
 *
 * Polls Loki and durably inserts each accepted log into ClickHouse
 * before advancing the serial source cursor.
 * Bounds pending records and bytes and waits for durable writes.
 *
 * @example
 *   const pipeline = activityTracking(
 *     'http://localhost:3100',
 *     'http://localhost:8123',
 *     '{app="traefik"}',
 *     { poll: 10, size: 100, interval: 5, threshold: 5, timeout: 60 }
 *   );
 *   pipeline.start();
 *   // ... later
 *   pipeline.stop();
 *
 * @param {string} loki - Loki base URL
 * @param {string} clickhouse - ClickHouse URL
 * @param {string} query - LogQL query string
 * @param {object} config - Pipeline configuration
 * @param {number} config.poll - Loki polling interval in seconds
 * @param {number} config.size - Legacy option; serial durable acceptance writes one record at a time
 * @param {number} config.interval - Seconds before time-based flush
 * @param {number} config.threshold - Legacy option (retained for configuration compatibility)
 * @param {number} config.timeout - Legacy option (use writeTimeoutMs for write deadlines)
 * @returns {object} Pipeline with start() and stop() methods
 */
export default function activityTracking(loki, clickhouse, query, config) {
    if (typeof loki !== 'string' || loki.length === 0) {
        throw new Error('Loki URL must be a non-empty string');
    }
    if (typeof clickhouse !== 'string' || clickhouse.length === 0) {
        throw new Error('ClickHouse URL must be a non-empty string');
    }
    if (typeof query !== 'string' || query.length === 0) {
        throw new Error('Query must be a non-empty string');
    }
    if (!config || typeof config !== 'object') {
        throw new Error('Config must be an object');
    }
    const clk = clock();
    const sink = clickhouseSink(clickhouse, 'activity.http_access');
    const collector = ingestBatch(sink, { ...config, size: 1 });
    const transformer = activityCodec(collector);
    const source = lokiSource(loki, query, config.poll, transformer, clk, { ...config.lokiOptions, budget: config.budget });
    return {
        /**
         * Starts the pipeline.
         */
        start() {
            return source.start();
        },
        /**
         * Stops the pipeline.
         */
        async stop() {
            await source.stop();
            try { await collector.stop(); } finally { await sink.stop?.(); }
        }
    };
}
