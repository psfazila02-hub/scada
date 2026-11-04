/** Deadline bounds the caller; capacity stays reserved until the actual write settles. */
export default function delivery(publish, options) {
    const pending = new Set();
    let bytes = 0;
    return (channel, value, context = {}) => {
        const size = Buffer.byteLength(JSON.stringify({ channel, value }));
        if (pending.size >= options.maxPending || bytes + size > options.maxPendingBytes) {
            return Promise.reject(new Error('OPC UA delivery capacity exceeded; live value dropped'));
        }
        const controller = new AbortController();
        function abort() { controller.abort(context.signal.reason); }
        context.signal?.addEventListener('abort', abort, { once: true });
        const actual = Promise.resolve().then(() => {
            if (context.signal?.aborted) { abort(); }
            controller.signal.throwIfAborted();
            return publish(channel, value, { signal: controller.signal });
        });
        pending.add(actual);
        bytes += size;
        function release() { pending.delete(actual); bytes -= size; }
        actual.then(release, release);
        let timer;
        const deadline = new Promise((resolve, reject) => {
            timer = setTimeout(() => {
                controller.abort(new Error('OPC UA delivery deadline exceeded; outcome uncertain'));
                reject(controller.signal.reason);
            }, options.deliveryTimeoutMs);
        });
        return Promise.race([actual, deadline]).finally(() => {
            clearTimeout(timer);
            context.signal?.removeEventListener('abort', abort);
        });
    };
}
