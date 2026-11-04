import { checkSubscription, watchSubscription } from './subscriptionHealth.js';
import { AttributeIds, TimestampsToReturn } from 'node-opcua';

function report(state, options, error) {
    try { options.onError?.(error, state.connection); } catch {
        // Callback isolation.
    }
}
function admitted(state, options) {
    if (state.pending.size < options.maxPending) { return true; }
    if (!state.overflow) {
        state.overflow = true;
        report(state, options, new Error('OPC UA notification capacity exceeded; live value dropped'));
    }
    return false;
}
export function deliver(state, channel, value, publish, options) {
    if (state.active && !state.failure && value.statusCode.isGood() && admitted(state, options)) {
        const accepted = Promise.resolve().then(() => {
            if (state.active && !state.failure) {
                return publish(channel, value.value.value, { signal: state.controller.signal });
            }
            return undefined;
        }).catch((error) => { report(state, options, error); }).finally(() => {
            state.pending.delete(accepted);
            state.overflow = false;
        });
        state.pending.add(accepted);
    }
}
async function monitors(subscription, state, connection, publish, options) {
    await Promise.all(connection.channels.map(async (channel) => {
        const item = await subscription.monitor({ nodeId: channel.nodeId, attributeId: AttributeIds.Value },
            { samplingInterval: connection.publishMs, discardOldest: true, queueSize: 10 }, TimestampsToReturn.Both);
        if (!item.statusCode.isGood()) {
            throw new Error(`Cannot monitor ${channel.nodeId}: ${item.statusCode.toString()}`);
        }
        item.on('changed', (value) => { deliver(state, channel, value, publish, options); });
    }));
}
function pause(state, milliseconds) {
    return new Promise((resolve) => {
        state.wake = resolve;
        state.timer = setTimeout(resolve, milliseconds);
    }).finally(() => { clearTimeout(state.timer); });
}
async function heartbeat(state, activeSession, connection, publish, options) {
    while (state.active) {
        checkSubscription(state, options);
        // Fresh reads are serialized; a slow read cannot overlap the next heartbeat.
        // eslint-disable-next-line no-await-in-loop
        await pause(state, connection.heartbeatMs);
        if (state.active) {
            checkSubscription(state, options);
            // eslint-disable-next-line no-await-in-loop
            const values = await activeSession.read(connection.channels.map(({ nodeId }) => { return { nodeId, attributeId: AttributeIds.Value }; }), 0);
            values.forEach((value, index) => { deliver(state, connection.channels[index], value, publish, options); });
        }
    }
}
export default async function session(state, client, connection, publish, options) {
    const activeSession = await client.createSession();
    if (state.active) {
        const subscription = await activeSession.createSubscription2({ requestedPublishingInterval: connection.publishMs,
            requestedLifetimeCount: 30, requestedMaxKeepAliveCount: 3, maxNotificationsPerPublish: 0, publishingEnabled: true, priority: 0 });
        watchSubscription(state, subscription);
        await monitors(subscription, state, connection, publish, options);
        await heartbeat(state, activeSession, connection, publish, options);
    }
}
