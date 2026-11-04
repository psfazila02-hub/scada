import { amqpSource } from '@yarkivaev/source-to-sink';
import deliverToMqttRecord from './deliverToMqttRecord.js';

/**
 * Builds a queue consumer callback bound to one AMQP channel.
 *
 * @param {object} sink - sink with write(records)
 * @param {object} channel - amqplib channel with ack(msg)
 * @returns {Function} consume callback for ch.consume
 */
export function relayConsumer(sink, channel) {
    return (msg) => {
        if (!msg) {
            return undefined;
        }
        const record = deliverToMqttRecord(msg.fields, msg.content);
        const written = sink.write([record]);
        if (written && typeof written.then === 'function') {
            return written.then(() => { channel.ack(msg); });
        }
        channel.ack(msg);
        return undefined;
    };
}

/**
 * AMQP queue consumer that republishes messages to MQTT using routing key as topic.
 *
 * @example
 *   import { mqttSink } from '@yarkivaev/source-to-sink';
 *   const sink = mqttSink('mqtt://localhost:1883', { qos: 1 });
 *   const relay = amqpMqttRelay('amqp://localhost', 'scada.telemetry.ingest', sink);
 *   relay.start();
 *
 * @param {string} amqpUrl - RabbitMQ AMQP URL
 * @param {string} queue - Durable queue name to consume
 * @param {object} sink - mqttSink with start, stop, write
 * @param {object} [options] - prefetch count
 * @returns {object} Relay with start and stop
 */
export default function amqpMqttRelay(amqpUrl, queue, sink, options = {}) {
    const prefetch = options.prefetch || 32;
    let opened = false;
    const session = amqpSource(amqpUrl, queue, {
        accept(delivery) {
            return sink.write([deliverToMqttRecord(delivery.fields, delivery.content)]);
        }
    }, { ...options, prefetch });
    return {
        async start() {
            if (!opened) {
                await sink.start();
                opened = true;
            }
            return session.start();
        },
        async stop() {
            await session.stop();
            await sink.stop();
            opened = false;
        }
    };
}
