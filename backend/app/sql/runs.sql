-- name: UPSERT_RUN
INSERT INTO runs (
    id, stage, kind, status, created_at, updated_at, started_at, completed_at,
    command_json, plan_path, log_path, error, plan_summary_json, outputs_json,
    source_run_id, queue_position, cancel_requested
) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, COALESCE((SELECT cancel_requested FROM runs WHERE id = %s), FALSE))
ON CONFLICT(id) DO UPDATE SET
    stage = excluded.stage,
    kind = excluded.kind,
    status = excluded.status,
    created_at = excluded.created_at,
    updated_at = excluded.updated_at,
    started_at = excluded.started_at,
    completed_at = excluded.completed_at,
    command_json = excluded.command_json,
    plan_path = excluded.plan_path,
    log_path = excluded.log_path,
    error = excluded.error,
    plan_summary_json = excluded.plan_summary_json,
    outputs_json = excluded.outputs_json,
    source_run_id = excluded.source_run_id,
    queue_position = excluded.queue_position

-- name: SELECT_RUN_BY_ID
SELECT * FROM runs WHERE id = %s

-- name: SELECT_RUNS_ORDERED
SELECT * FROM runs ORDER BY created_at DESC

-- name: DELETE_RUN_LOGS_BY_RUN_IDS
DELETE FROM run_logs WHERE run_id = ANY(%s)

-- name: DELETE_RUNS_BY_IDS
DELETE FROM runs WHERE id = ANY(%s)

-- name: SELECT_HAS_NONTERMINAL_RUNS
SELECT EXISTS(
    SELECT 1
    FROM runs
    WHERE status IN ('queued', 'running', 'applying', 'destroying', 'canceling')
) AS exists

-- name: SELECT_QUEUE_DEPTH
SELECT COUNT(*) AS count
FROM runs
WHERE status = 'queued' AND cancel_requested = FALSE AND claimed_by IS NULL

-- name: CLEAR_QUEUE_POSITIONS
UPDATE runs SET queue_position = NULL WHERE status <> 'queued' OR cancel_requested = TRUE OR claimed_by IS NOT NULL

-- name: REFRESH_QUEUE_POSITIONS
WITH ranked AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS position
    FROM runs
    WHERE status = 'queued' AND cancel_requested = FALSE AND claimed_by IS NULL
)
UPDATE runs AS target
SET queue_position = ranked.position
FROM ranked
WHERE target.id = ranked.id

-- name: SELECT_RUN_CLAIMED
SELECT claimed_by IS NOT NULL AS claimed FROM runs WHERE id = %s

-- name: REQUEST_RUN_CANCELLATION
UPDATE runs SET cancel_requested = TRUE, updated_at = %s WHERE id = %s

-- name: CLEAR_RUN_CANCELLATION
UPDATE runs SET cancel_requested = FALSE WHERE id = %s

-- name: SELECT_CANCEL_REQUESTED
SELECT cancel_requested FROM runs WHERE id = %s

-- name: SELECT_NEXT_QUEUED_RUN
SELECT id
FROM runs
WHERE status = 'queued' AND cancel_requested = FALSE AND claimed_by IS NULL
ORDER BY created_at ASC
FOR UPDATE SKIP LOCKED
LIMIT 1

-- name: CLAIM_RUN
UPDATE runs SET claimed_by = %s, queue_position = NULL, updated_at = %s WHERE id = %s

-- name: CLEAR_CLAIM
UPDATE runs SET claimed_by = NULL, cancel_requested = FALSE WHERE id = %s

-- name: CLEAR_CLAIM_BY_WORKER
UPDATE runs SET claimed_by = NULL, cancel_requested = FALSE WHERE id = %s AND claimed_by = %s

-- name: UPSERT_WORKER
INSERT INTO workers (id, heartbeat_at, started_at, updated_at, active_run_id)
VALUES (%s, %s, %s, %s, %s)
ON CONFLICT(id) DO UPDATE SET
    heartbeat_at = excluded.heartbeat_at,
    updated_at = excluded.updated_at,
    active_run_id = excluded.active_run_id

-- name: DELETE_WORKER
DELETE FROM workers WHERE id = %s

-- name: SELECT_WORKER_SNAPSHOT
SELECT id, active_run_id
FROM workers
WHERE heartbeat_at >= %s
ORDER BY heartbeat_at DESC
LIMIT 1

-- name: SELECT_STALE_WORKERS
SELECT id FROM workers WHERE heartbeat_at < %s

-- name: SELECT_RUNS_BY_WORKER_IDS
SELECT *
FROM runs
WHERE claimed_by = ANY(%s)
ORDER BY created_at ASC

-- name: UNCLAIM_QUEUED_RUN
UPDATE runs SET claimed_by = NULL, updated_at = %s WHERE id = %s

-- name: DELETE_WORKERS_BY_IDS
DELETE FROM workers WHERE id = ANY(%s)

-- name: INSERT_RUN_LOG
INSERT INTO run_logs (run_id, line) VALUES (%s, %s)

-- name: SELECT_RUN_LOGS
SELECT line FROM run_logs WHERE run_id = %s ORDER BY id ASC

-- name: SELECT_RUN_LOGS_AFTER_OFFSET
SELECT line FROM run_logs WHERE run_id = %s ORDER BY id ASC OFFSET %s
