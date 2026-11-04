import deadline from './deadline.js';
import stateDocument from './stateDocument.js';

async function save(ctx, changes) {
    if (ctx.failed) { throw new Error('Task state requires reload'); }
    ctx.options.signal?.throwIfAborted();
    const next = { ...ctx.data, ...changes };
    try {
        const version = await ctx.store.commit({ ...next, expectedVersion: ctx.data.version, ownership: ctx.options.ownership });
        ctx.options.signal?.throwIfAborted();
        Object.assign(ctx, { data: { ...next, version } });
    } catch (error) { Object.assign(ctx, { failed: true }); throw error; }
}
async function resume(ctx, sinks) {
    if (ctx.failed) { throw new Error('Task state requires reload'); }
    if (!ctx.data) { throw new Error('Task state must be opened'); }
    if (!ctx.data.pending) { return; }
    const { event, remaining, checkpoint } = ctx.data.pending;
    for (const name of remaining) {
        ctx.options.signal?.throwIfAborted();
        if (!sinks[name]) { throw new Error('Missing required sink'); }
        // Sequential fan-out persists every durable acknowledgement before continuing.
        // eslint-disable-next-line no-await-in-loop
        await deadline(() => { return sinks[name].write([event], { signal: ctx.options.signal }); }, ctx.options.writeTimeoutMs ?? 10000);
        const pending = { event, checkpoint, remaining: ctx.data.pending.remaining.filter((item) => { return item !== name; }) };
        // eslint-disable-next-line no-await-in-loop
        await save(ctx, { pending });
    }
    await save(ctx, { checkpoint, pending: null });
}
function exclusive(ctx, action) {
    if (ctx.busy) { return Promise.reject(new Error('Task state operation in progress')); }
    ctx.busy = true;
    return Promise.resolve().then(action).finally(() => { ctx.busy = false; });
}
async function open(ctx) {
    const saved = await ctx.store.load(ctx.options.taskId);
    if (saved && (saved.stateVersion !== ctx.options.stateVersion || saved.compatibilityKey !== ctx.options.compatibilityKey)) {
        throw new Error('Recovered task state is incompatible');
    }
    ctx.options.signal?.throwIfAborted();
    Object.assign(ctx, { data: saved ?? { taskId: ctx.options.taskId, version: 0, stateVersion: ctx.options.stateVersion,
        compatibilityKey: ctx.options.compatibilityKey, checkpoint: null, pending: null } });
    Object.assign(ctx, { failed: false });
}
async function deliver(ctx, event, sinks, checkpoint) {
    if (ctx.failed) { throw new Error('Task state requires reload'); }
    if (!ctx.data) { throw new Error('Task state must be opened'); }
    if (ctx.data.pending) { throw new Error('Pending delivery must be resumed first'); }
    if (typeof event.eventId !== 'string' || !event.eventId || Object.keys(sinks).length === 0) {
        throw new TypeError('Stable eventId and required sinks are mandatory');
    }
    const pending = stateDocument({ event, remaining: Object.keys(sinks), checkpoint }, ctx.options.maxBytes ?? 1048576);
    await save(ctx, { pending });
    await resume(ctx, sinks);
}
/** Durable per-recipient outbox. CAS detects conflicts; it is not distributed fencing. */
export default function taskState(store, options) {
    const ctx = { store, options, data: null, busy: false, failed: false };
    return {
        open() { return exclusive(ctx, () => { return open(ctx); }); },
        deliver(event, sinks, checkpoint) { return exclusive(ctx, () => { return deliver(ctx, event, sinks, checkpoint); }); },
        resume(sinks) { return exclusive(ctx, () => { return resume(ctx, sinks); }); },
        checkpoint(value) {
            return exclusive(ctx, () => {
                if (!ctx.data) { throw new Error('Task state must be opened'); }
                if (ctx.data.pending) { throw new Error('Pending delivery must be resumed first'); }
                return save(ctx, { checkpoint: stateDocument(value, options.maxBytes ?? 1048576) });
            });
        },
        snapshot() { return structuredClone(ctx.data); }
    };
}
