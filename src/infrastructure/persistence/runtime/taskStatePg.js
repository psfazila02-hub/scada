/** Atomic state compare-and-swap; distributed ownership must be integrated separately. */
export default function taskStatePg(pool, { maxBytes = 1048576 } = {}) {
    return {
        async load(taskId) {
            const result = await pool.query('SELECT version, document FROM collector_task_state WHERE task_id = $1', [taskId]);
            if (!result.rows.length) { return null; }
            return { ...result.rows[0].document, version: Number(result.rows[0].version) };
        },
        async commit(input) {
            if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) { throw new TypeError('Invalid expectedVersion'); }
            if (input.ownership !== undefined) { throw new Error('This store has no external ownership integration'); }
            const { expectedVersion } = input;
            const document = { taskId: input.taskId, stateVersion: input.stateVersion, compatibilityKey: input.compatibilityKey,
                checkpoint: input.checkpoint, pending: input.pending };
            const json = JSON.stringify(document);
            if (Buffer.byteLength(json) > maxBytes) { throw new Error('Task state capacity exceeded'); }
            const result = expectedVersion === 0
                ? await pool.query('INSERT INTO collector_task_state (task_id, version, document) VALUES ($1, 1, $2::jsonb) ON CONFLICT DO NOTHING RETURNING version', [input.taskId, json])
                : await pool.query('UPDATE collector_task_state SET version = version + 1, document = $2::jsonb, updated_at = now() WHERE task_id = $1 AND version = $3 RETURNING version', [input.taskId, json, expectedVersion]);
            if (!result.rows.length) { throw new Error('Task state conflict'); }
            return Number(result.rows[0].version);
        }
    };
}
