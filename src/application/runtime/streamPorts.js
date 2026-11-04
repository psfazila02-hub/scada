import { clock, intervalSource } from '@yarkivaev/source-to-sink';
import { amqpSink, amqpSource, clickhouseSink, lokiSource, modbusRtuSource, modbusSource, mqttSink, mqttSource, postgresSink, serialSource } from '../../infrastructure/streams/index.js';
import opcuaSource from '../../infrastructure/opcua/source.js';
import resolveSecrets from './resolveSecrets.js';

// Protocol buffers charge bytes; stream acceptance owns the logical record slot.
function bytesOnly(budget) {
    return { reserve({ bytes }) { return budget.reserve({ bytes, records: 0 }); } };
}
function configured(factory) {
    return (spec, collector, context) => { return factory(resolveSecrets(spec, context.secrets), collector, context); };
}
export function sources() {
    return new Map([
        ['opcua', configured((spec, collector, ctx) => { return opcuaSource(spec.connections, collector, { ...spec.options, budget: bytesOnly(ctx.budget), onError() { ctx.report?.({ state: 'degraded' }); } }); })],
        ['serial', configured((spec, collector, ctx) => { return serialSource(spec.devices, collector, { ...spec.options, budget: bytesOnly(ctx.budget), onError() { ctx.report?.({ state: 'degraded' }); } }); })],
        ['amqp', configured((spec, collector, ctx) => { return amqpSource(spec.url, spec.queue, collector, { ...spec.options, budget: bytesOnly(ctx.budget) }); })],
        ['mqtt', configured((spec, collector, ctx) => { return mqttSource(spec.url, spec.topics, collector, { ...spec.options, budget: bytesOnly(ctx.budget) }); })],
        ['interval', configured((spec, collector) => { return intervalSource(spec.intervalMs, collector, spec.options); })],
        ['loki', configured((spec, collector) => { return lokiSource(spec.url, spec.query, spec.interval, collector, clock(), spec.options); })],
        ['modbus-tcp', configured((spec, collector) => { return modbusSource(spec.host, spec.port, spec.address, spec.count, spec.interval, collector, clock()); })],
        ['modbus-rtu', configured((spec, collector) => { return modbusRtuSource(spec.path, spec.serial, spec.address, spec.count, spec.interval, collector, clock()); })]
    ]);
}
export function sinks() {
    const factories = new Map([
        ['amqp', (spec) => { return amqpSink(spec.url, spec.options); }],
        ['mqtt', (spec) => { return mqttSink(spec.url, spec.options); }],
        ['clickhouse', (spec) => { return clickhouseSink(spec.url, spec.table); }],
        ['postgres', (spec) => { return postgresSink(spec.url, spec.table, spec.columns); }]
    ]);
    return new Map(Array.from(factories, ([name, factory]) => {
        return [name, (spec, context) => { return factory(resolveSecrets(spec, context.secrets)); }];
    }));
}
export function resources(spec) {
    const {source} = spec;
    if (source.type === 'serial') { return [...new Set(source.devices.map((device) => { return `serial:${device.path}`; }))]; }
    if (source.type === 'modbus-rtu') { return [`serial:${source.path}`]; }
    if (source.type === 'opcua') { return source.connections.map((connection) => { return `opcua:${connection.url}`; }); }
    return [];
}
