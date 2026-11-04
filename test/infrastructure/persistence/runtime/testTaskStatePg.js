import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { GenericContainer, Wait } from 'testcontainers';
import ciContainerImage from '../../../helpers/ciContainerImage.js';
import taskStatePg from '../../../../src/infrastructure/persistence/runtime/taskStatePg.js';

describe('portable state PostgreSQL CAS', function() {
    this.timeout(90000);
    let container;
    let pool;
    before(async () => {
        container = await new GenericContainer(ciContainerImage('postgres', '16-alpine')).withExposedPorts(5432)
            .withEnvironment({ POSTGRES_PASSWORD: 'test', POSTGRES_DB: 'test' })
            .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections', 2)).start();
        pool = new pg.Pool({ host: container.getHost(), port: container.getMappedPort(5432), user: 'postgres', password: 'test', database: 'test' });
        await pool.query(await readFile(new URL('../../../../db/migrations/V0009__collector_task_state.sql', import.meta.url), 'utf8'));
    });
    after(async () => { await pool?.end(); await container?.stop(); });
    it('allows exactly one concurrent commit and restores state through another instance', async () => {
        const first = taskStatePg(pool);
        const second = taskStatePg(pool);
        const value = { taskId: 'source', expectedVersion: 0, stateVersion: 1, compatibilityKey: 'one', checkpoint: { id: 3 }, pending: null };
        const results = await Promise.allSettled([first.commit(value), second.commit(value)]);
        assert.equal(results.filter(result => { return result.status === 'fulfilled'; }).length, 1);
        assert.equal((await second.load('source')).version, 1);
        await first.commit({ ...value, expectedVersion: 1, checkpoint: { id: 4 } });
        assert.deepEqual((await second.load('source')).checkpoint, { id: 4 });
        await assert.rejects(second.commit({ ...value, expectedVersion: 1 }), /conflict/u);
    });
    it('cannot create an absent task with a nonzero expected version', async () => {
        const store = taskStatePg(pool);
        await assert.rejects(store.commit({ taskId: 'missing', expectedVersion: 5 }), /conflict/u);
        assert.equal(await store.load('missing'), null);
    });
});
