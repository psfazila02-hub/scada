/**
 * Modbus collector entry point.
 *
 * Polls ADDRESS or MODBUS_DEVICES and publishes STREAM + MAPPING document paths.
 */
process.on('unhandledRejection', (err) => {
    process.stderr.write(`Unhandled rejection: ${String(err)}\n`);
    process.exit(1);
});

import modbusPublish from '../infrastructure/ingest/mqtt/modbusPublish.js';

/**
 * Parses a JSON array environment value.
 *
 * @param {string|undefined} text - environment value
 * @returns {Array|undefined} parsed array
 */
function jsonList(text) {
    if (typeof text !== 'string' || !text.startsWith('[')) {
        return undefined;
    }
    return JSON.parse(text);
}

/**
 * Parses an optional integer environment value.
 *
 * @param {string|undefined} text - environment value
 * @returns {number|undefined} parsed integer
 */
function integer(text) {
    if (typeof text !== 'string' || text.length === 0) {
        return undefined;
    }
    const value = parseInt(text, 10);
    if (Number.isNaN(value)) {
        throw new Error(`Expected a number, got: ${text}`);
    }
    return value;
}

const addresses = jsonList(process.env.ADDRESS);
const pipeline = modbusPublish(process.env.MQTT_URL, {
    address: integer(process.env.MODBUS_ADDRESS),
    addresses,
    clientId: process.env.CLIENT_ID,
    count: integer(process.env.MODBUS_COUNT),
    devices: process.env.MODBUS_DEVICES,
    interval: parseInt(process.env.POLL_INTERVAL || '5', 10),
    maps: jsonList(process.env.MAPPING) || [],
    streams: jsonList(process.env.STREAM) || [],
    threshold: parseInt(process.env.CIRCUIT_THRESHOLD || '5', 10),
    timeout: parseInt(process.env.CIRCUIT_TIMEOUT || '60', 10)
});

pipeline.start();
