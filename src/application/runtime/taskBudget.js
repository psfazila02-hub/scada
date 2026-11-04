function validate(value, name) {
    if (!Number.isSafeInteger(value) || value < 0) { throw new TypeError(`Invalid ${name}`); }
}
/** No waiting queue: callers choose backpressure, durable spooling or explicit loss. */
export default function taskBudget(limits, parent) {
    validate(limits.maxBytes, 'maxBytes');
    validate(limits.maxRecords, 'maxRecords');
    const usage = { bytes: 0, records: 0 };
    return {
        reserve({ bytes, records }) {
            validate(bytes, 'reservation');
            validate(records, 'reservation');
            if (usage.bytes + bytes > limits.maxBytes || usage.records + records > limits.maxRecords) {
                throw new Error('Task capacity exceeded');
            }
            const releaseParent = parent?.reserve({ bytes, records });
            usage.bytes += bytes;
            usage.records += records;
            let released = false;
            return () => {
                if (!released) {
                    released = true;
                    usage.bytes -= bytes;
                    usage.records -= records;
                    releaseParent?.();
                }
            };
        },
        status() { return { ...usage }; }
    };
}
