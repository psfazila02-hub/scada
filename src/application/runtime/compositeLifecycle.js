async function close(state) {
    const failures = [];
    for (const part of [...state.opened].reverse()) {
        try {
            // Reverse startup order; every owned resource receives a stop attempt.
            // eslint-disable-next-line no-await-in-loop
            await part.stop();
        } catch (error) { failures.push(error); }
    }
    if (failures.length) { throw new AggregateError(failures, 'Composite cleanup failed'); }
    state.opened = [];
}
function cleanup(state) {
    state.closing ??= close(state);
    return state.closing;
}
async function open(state, parts) {
    try {
        for (const part of parts) {
            if (state.stopped) { throw new Error('Composite startup aborted'); }
            state.opened.push(part);
            // Register ownership before awaiting potentially cancellable startup.
            // eslint-disable-next-line no-await-in-loop
            await part.start();
            if (state.stopped) { throw new Error('Composite startup aborted'); }
        }
    } catch (error) {
        try { await cleanup(state); } catch (failure) { throw new AggregateError([error, failure], 'Start and cleanup failed'); }
        throw error;
    }
}
/** Stop attempts cancellation immediately, then waits for startup to settle. */
export default function compositeLifecycle({ inputs, outputs }) {
    const state = { opened: [], starting: null, closing: null, stopping: null, stopped: false };
    return {
        start() {
            if (state.stopped) { return Promise.reject(new Error('Composite stopped')); }
            state.starting ??= open(state, [...outputs, ...inputs]);
            return state.starting;
        },
        stop() {
            state.stopped = true;
            state.stopping ??= Promise.all([cleanup(state), Promise.resolve(state.starting).catch(() => {
                // Startup failure remains visible to its own caller.
            })]);
            return state.stopping;
        }
    };
}
