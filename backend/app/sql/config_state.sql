-- name: UPSERT_CONFIG_STATE
INSERT INTO config_state (key, payload_json, updated_at)
VALUES (%s, %s, %s)
ON CONFLICT(key) DO UPDATE SET
    payload_json = excluded.payload_json,
    updated_at = excluded.updated_at

-- name: SELECT_CONFIG_STATE
SELECT payload_json FROM config_state WHERE key = %s
