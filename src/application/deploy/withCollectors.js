/**
 * Adds collector rows the chart groups by command.
 *
 * The plant supplies the argv. Mapping is copied as the machine has it.
 *
 * @example
 *   withCollectors({ machines: [{ from: 'modbus://192.0.2.10:502', name: 'mill/electrical' }] }, () => { return ['node', 'bin/modbus-to-mqtt.js']; });
 *
 * @param {object} values - release values
 * @param {function} command - address and stream to argv
 * @returns {object} values whose collectors carry command, address, and path
 */
export default function withCollectors(values, command) {
    return {
        ...values,
        collectors: (values.machines || []).map((machine) => {
            const item = {
                address: machine.from,
                command: command(machine.from, machine.name),
                path: machine.name
            };
            if (machine.mapping) {
                item.mapping = machine.mapping;
            }
            return item;
        })
    };
}
