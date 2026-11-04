CREATE TABLE IF NOT EXISTS collector_task_state (
    task_id text PRIMARY KEY,
    version bigint NOT NULL CHECK (version > 0),
    document jsonb NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
);
