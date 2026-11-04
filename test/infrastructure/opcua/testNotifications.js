import assert from 'node:assert/strict';
import { deliver } from '../../../src/infrastructure/opcua/session.js';

describe('OPC UA notification admission', function () {
    it('bounds queued callbacks before a synchronous notification burst reaches the collector', async function () {
        const state = { active: true, pending: new Set(), controller: new AbortController() };
        const value = { statusCode: { isGood() { return true; } }, value: { value: 42 } };
        const errors = [];
        const options = { maxPending: 1, onError(error) { errors.push(error); } };
        for (let index = 0; index < 100; index += 1) {
            deliver(state, {}, value, () => {}, options);
        }
        assert.equal(state.pending.size, 1);
        assert.equal(errors.length, 1);
        assert.match(errors[0].message, /capacity/u);
        await Promise.all(state.pending);
        assert.equal(state.pending.size, 0);
    });
});
