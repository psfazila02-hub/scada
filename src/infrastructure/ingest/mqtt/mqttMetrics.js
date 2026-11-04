import { mqttSource } from '@yarkivaev/source-to-sink';
import ingestBatch from '../ingestBatch.js';
import metricsCodec from './metricsTransformer.js';

/**
 * Pipeline for streaming MQTT sensor data to a storage sink.
 *
 * Subscribes to MQTT and writes each message before acknowledging it.
 * MQTT.js serializes acknowledgement, so acceptance cannot wait for a larger batch.
 * Bounds queued records and bytes and enforces a durable-write deadline.
 *
 * @example
 *   import { clickhouseSink } from '@yarkivaev/source-to-sink';
 *   const sink = clickhouseSink('http://localhost:8123', 'scada.metrics');
 *   const pipeline = mqttMetrics(
 *     'mqtt://localhost:1883',
 *     sink,
 *     'sensors/#',
 *     { size: 100, interval: 5, threshold: 5, timeout: 60 }
 *   );
 *   pipeline.start();
 *   // ... later
 *   pipeline.stop();
 *
 * @param {string} mqtt - MQTT broker URL
 * @param {object} sink - Sink with write(records) method
 * @param {string} topic - MQTT topic pattern to subscribe
 * @param {object} config - Pipeline configuration
 * @param {number} config.size - Legacy option; serial durable acceptance writes one record at a time
 * @param {number} config.interval - Seconds before time-based flush
 * @param {number} config.threshold - Legacy option (retained for configuration compatibility)
 * @param {number} config.timeout - Legacy option (use writeTimeoutMs for write deadlines)
 * @param {string} [config.clientId] - MQTT client ID for persistent sessions
 * @param {number} [config.sessionExpiryInterval] - Session expiry in seconds (default 3600)
 * @returns {object} Pipeline with start() and stop() methods
 */
export default function mqttMetrics(mqtt, sink, topic, config) {
    if (typeof mqtt !== 'string' || mqtt.length === 0) {
        throw new Error('MQTT URL must be a non-empty string');
    }
    if (!sink || typeof sink.write !== 'function') {
        throw new Error('Sink must have a write(records) method');
    }
    if (typeof topic !== 'string' || topic.length === 0) {
        throw new Error('Topic must be a non-empty string');
    }
    if (!config || typeof config !== 'object') {
        throw new Error('Config must be an object');
    }
    const collector = ingestBatch(sink, { ...config, size: 1 });
    const transformer = metricsCodec(collector);
    const source = mqttSource(mqtt, topic, transformer, {
        budget: config.budget,
        prefetch: config.prefetch,
        maxPacketBytes: config.maxBytes,
        clientId: config.clientId,
        sessionExpiryInterval: config.sessionExpiryInterval
    });
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
            await collector.stop();
        }
    };
}
