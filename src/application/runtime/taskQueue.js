/** Serial execution with admission bounded before adding anything to the chain. */
export default function taskQueue({ budget, signal }) {
    let pending = Promise.resolve();
    return {
        run(operation, { bytes = 0, records = 1 } = {}) {
            try {
                signal.throwIfAborted();
                const release = budget.reserve({ bytes, records });
                const result = pending.then(() => {
                    signal.throwIfAborted();
                    return operation();
                }).finally(release);
                pending = result.catch(() => {
                    // Rejection belongs to this operation, not the next queued one.
                });
                return result;
            } catch (error) { return Promise.reject(error); }
        },
        drain() { return pending; }
    };
}
