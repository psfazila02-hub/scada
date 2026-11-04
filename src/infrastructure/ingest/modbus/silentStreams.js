import { clock, intervalSource } from '@yarkivaev/source-to-sink';

function track(state, pending) {
    if (!pending || typeof pending.then !== 'function') { return; }
    const task = pending.catch((error) => {
        state.failure = error;
        try { state.onError?.(error); } catch {
            // Reporting must not turn an observed source failure into an unhandled rejection.
        }
    })
        .finally(() => { state.pending.delete(task); });
    state.pending.add(task);
}
async function drained(state) {
    await Promise.all(state.pending);
    if (state.failure) { throw state.failure; }
}
/**
 * Whether a stream is past the silence budget.
 *
 * @param {Map<string, number>} lastSeen - Stream id to last edge millis
 * @param {string} name - Stream id
 * @param {object} clk - Clock
 * @param {number} budgetMs - Silence budget in milliseconds
 * @returns {boolean} True when Modbus backup should run
 */
function isSilent(lastSeen, name, clk, budgetMs) {
    const at = lastSeen.get(name);
    if (at === undefined) {
        return true;
    }
    return clk.millis() - at >= budgetMs;
}

/**
 * Stops one started poll if present. The poll instance is kept for reuse.
 *
 * @param {object} state - Gate mutable state
 * @param {string} name - Stream id
 */
function stopOne(state, name) {
    if (!state.live.has(name)) {
        return;
    }
    if (state.closing.has(name)) { return; }
    const pending = state.held.get(name).stop();
    if (pending && typeof pending.then === 'function') {
        state.closing.add(name);
        track(state, pending.finally(() => { state.live.delete(name); state.closing.delete(name); }));
    } else { state.live.delete(name); }
}

/**
 * Starts one poll, opening the source only the first time.
 *
 * @param {object} state - Gate mutable state
 * @param {object} source - Stream source
 */
function startOne(state, source) {
    const name = source.name();
    if (state.live.has(name)) {
        return;
    }
    let poll = state.held.get(name);
    if (!poll) {
        poll = source.open(state.collector, state.clk, state.intervalSec);
        state.held.set(name, poll);
    }
    track(state, poll.start());
    state.live.add(name);
}

/**
 * Reconciles active polls with current silence state.
 *
 * @param {object} state - Gate mutable state
 */
function pulse(state) {
    if (!state.running || !state.collector) {
        return;
    }
    for (const source of state.sources) {
        const name = source.name();
        if (isSilent(state.lastSeen, name, state.clk, state.budgetMs)) {
            startOne(state, source);
        } else {
            stopOne(state, name);
        }
    }
}

/**
 * Builds mutable gate state from config.
 *
 * @param {object} config - silentStreams config
 * @returns {object} Mutable state bag
 */
function gateState(config) {
    const { budget, interval, sources } = config;
    return {
        budgetMs: budget * 1000,
        intervalSec: interval,
        sources,
        clk: config.clock || clock(),
        delay: config.delay || setTimeout,
        clear: config.clear || clearTimeout,
        lastSeen: new Map(),
        held: new Map(),
        live: new Set(),
        closing: new Set(),
        pending: new Set(),
        failure: null,
        onError: config.onError,
        collector: undefined,
        running: false
    };
}

/**
 * Polls configured Modbus streams only while their edge telemetry is silent.
 *
 * Edge freshness is reported via seen(name); Modbus writes go to the bound sink
 * and never count as seen. Streams never seen are treated as already silent.
 *
 * @example
 *   const streams = silentStreams({
 *     budget: 15,
 *     interval: 5,
 *     sources: [mx210Tcp('m-1', '192.0.2.10', 502)]
 *   });
 *   streams.bind(clickhouseSink);
 *   streams.start();
 *
 * @param {object} config - budget (sec), interval (sec), sources, optional clock/delay/clear
 * @returns {object} Gate with seen, bind, start, stop, pulse
 */
export default function silentStreams(config) {
    const state = gateState(config);
    function runPulse() {
        pulse(state);
    }
    const ticker = intervalSource(state.intervalSec * 1000, { accept: runPulse }, {
        schedule: state.delay, clear: state.clear
    });
    return {
        seen(name, at = state.clk.millis()) {
            state.lastSeen.set(name, at);
            if (state.running) {
                runPulse();
            }
        },
        bind(sink) {
            state.collector = {
                accept(record) {
                    return sink.write([record]);
                }
            };
        },
        start() {
            if (state.running) { return drained(state); }
            state.running = true;
            runPulse();
            track(state, ticker.start());
            return drained(state);
        },
        async stop() {
            state.running = false;
            track(state, ticker.stop());
            for (const name of [...state.live]) {
                stopOne(state, name);
            }
            await drained(state);
            state.held.clear();
        },
        pulse: runPulse
    };
}
