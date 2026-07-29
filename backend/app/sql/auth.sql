-- name: UPSERT_USER
INSERT INTO users (id, subject, username, email, display_name, roles_json, created_at, updated_at)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
ON CONFLICT(subject) DO UPDATE SET
    username = excluded.username,
    email = excluded.email,
    display_name = excluded.display_name,
    roles_json = excluded.roles_json,
    updated_at = excluded.updated_at

-- name: SELECT_USER_BY_SUBJECT
SELECT * FROM users WHERE subject = %s

-- name: CREATE_SESSION
INSERT INTO sessions (
    id, user_id, token_hash, subject, id_token, expires_at,
    created_at, updated_at, revoked_at, user_agent, ip_address
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, %s, %s)

-- name: SELECT_ACTIVE_SESSION
SELECT
    sessions.id,
    sessions.user_id,
    sessions.subject,
    sessions.id_token,
    sessions.expires_at,
    users.username,
    users.email,
    users.display_name,
    users.roles_json
FROM sessions
JOIN users ON users.id = sessions.user_id
WHERE sessions.token_hash = %s
  AND sessions.revoked_at IS NULL
  AND sessions.expires_at > %s

-- name: TOUCH_SESSION
UPDATE sessions SET updated_at = %s WHERE id = %s

-- name: REVOKE_SESSION
UPDATE sessions SET revoked_at = %s, updated_at = %s WHERE id = %s

-- name: INSERT_AUDIT_EVENT
INSERT INTO audit_events (
    user_id, session_id, method, path, status_code,
    action, resource_type, resource_id, details_json, created_at
)
VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
