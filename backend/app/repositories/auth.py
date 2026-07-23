from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from .base import BaseRepository, utc_now


class AuthRepository(BaseRepository):
    def upsert_user(
        self,
        *,
        subject: str,
        username: str,
        email: str | None,
        display_name: str | None,
        roles: list[str],
        now: datetime,
    ) -> dict[str, Any]:
        with self._connection() as connection:
            connection.execute(
                """
        INSERT INTO users (id, subject, username, email, display_name, roles_json, created_at, updated_at)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT(subject) DO UPDATE SET
            username = excluded.username,
            email = excluded.email,
            display_name = excluded.display_name,
            roles_json = excluded.roles_json,
            updated_at = excluded.updated_at
        """,
                (
                    subject,
                    subject,
                    username,
                    email,
                    display_name,
                    json.dumps(roles),
                    now.isoformat(),
                    now.isoformat(),
                ),
            )
            row = connection.execute("SELECT * FROM users WHERE subject = %s", (subject,)).fetchone()
        if row is None:
            raise RuntimeError(f"Authenticated user {subject} could not be loaded after upsert.")
        return self._row_to_user(row)

    def create_session(
        self,
        *,
        session_id: str,
        user_id: str,
        subject: str,
        token_hash: str,
        id_token: str | None,
        expires_at: datetime,
        user_agent: str | None,
        ip_address: str | None,
        now: datetime,
    ) -> None:
        with self._connection() as connection:
            connection.execute(
                """
        INSERT INTO sessions (
            id, user_id, token_hash, subject, id_token, expires_at,
            created_at, updated_at, revoked_at, user_agent, ip_address
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, NULL, %s, %s)
        """,
                (
                    session_id,
                    user_id,
                    token_hash,
                    subject,
                    id_token,
                    expires_at.isoformat(),
                    now.isoformat(),
                    now.isoformat(),
                    user_agent,
                    ip_address,
                ),
            )

    def load_active_session(self, token_hash: str) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                """
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
        """,
                (token_hash, utc_now().isoformat()),
            ).fetchone()
        if row is None:
            return None
        return {
            "id": str(row["id"]),
            "user_id": str(row["user_id"]),
            "subject": str(row["subject"]),
            "id_token": str(row["id_token"]) if row["id_token"] else None,
            "expires_at": row["expires_at"],
            "username": str(row["username"]),
            "email": str(row["email"]) if row["email"] else None,
            "display_name": str(row["display_name"]) if row["display_name"] else None,
            "roles": json.loads(str(row["roles_json"])) if row["roles_json"] else [],
        }

    def touch_session(self, session_id: str, now: datetime) -> None:
        with self._connection() as connection:
            connection.execute(
                "UPDATE sessions SET updated_at = %s WHERE id = %s",
                (now.isoformat(), session_id),
            )

    def revoke_session(self, session_id: str, now: datetime) -> None:
        with self._connection() as connection:
            connection.execute(
                "UPDATE sessions SET revoked_at = %s, updated_at = %s WHERE id = %s",
                (now.isoformat(), now.isoformat(), session_id),
            )

    def record_audit_event(
        self,
        *,
        user_id: str | None,
        session_id: str | None,
        method: str,
        path: str,
        status_code: int,
        action: str | None = None,
        resource_type: str | None = None,
        resource_id: str | None = None,
        details: dict[str, Any] | None = None,
        now: datetime | None = None,
    ) -> None:
        event_time = now or utc_now()
        with self._connection() as connection:
            connection.execute(
                """
        INSERT INTO audit_events (
            user_id, session_id, method, path, status_code,
            action, resource_type, resource_id, details_json, created_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
                (
                    user_id,
                    session_id,
                    method,
                    path,
                    status_code,
                    action,
                    resource_type,
                    resource_id,
                    json.dumps(details) if details is not None else None,
                    event_time.isoformat(),
                ),
            )

    def _row_to_user(self, row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "subject": str(row["subject"]),
            "username": str(row["username"]),
            "email": str(row["email"]) if row["email"] else None,
            "display_name": str(row["display_name"]) if row["display_name"] else None,
            "roles": json.loads(str(row["roles_json"])) if row["roles_json"] else [],
        }
