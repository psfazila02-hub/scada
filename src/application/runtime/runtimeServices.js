import pg from 'pg';
import taskStatePg from '../../infrastructure/persistence/runtime/taskStatePg.js';
import deadline from './deadline.js';

/** Storage is optional for live-only tasks and mandatory for durable adapters. */
export default function runtimeServices(env, supplied) {
    const pool = !supplied.stateStore && env.COLLECTOR_STATE_URL ? new pg.Pool({
        connectionString: env.COLLECTOR_STATE_URL, max: 4, connectionTimeoutMillis: 5000,
        query_timeout: 10000, statement_timeout: 10000, idleTimeoutMillis: 30000
    }) : null;
    return { ...supplied, secrets: supplied.secrets ?? { get(name) { return env[name]; } },
        stateStore: supplied.stateStore ?? (pool ? taskStatePg(pool) : undefined),
        close() { return pool ? deadline(() => { return pool.end(); }, 10000) : Promise.resolve(); }
    };
}
