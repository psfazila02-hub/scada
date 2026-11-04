/** Reservation follows the driver's actual promise, not an outer timeout race. */
export default function budgetedSink(sink, budget, countRecords = true) {
    return {
        start() { return sink.start?.(); },
        stop() { return sink.stop?.(); },
        write(records, options) {
            try {
                options?.signal?.throwIfAborted();
                const release = budget.reserve({ bytes: Buffer.byteLength(JSON.stringify(records)), records: countRecords ? records.length : 0 });
                return Promise.resolve().then(() => {
                    options?.signal?.throwIfAborted();
                    return sink.write(records, options);
                }).finally(release);
            } catch (error) { return Promise.reject(error); }
        }
    };
}
