from __future__ import annotations

from .base import BaseRepository


class SchemaRepository(BaseRepository):
    def _initialize_database(self) -> None:
        with self._connection() as connection:
            connection.execute(
                """
        CREATE TABLE IF NOT EXISTS runs (
            id TEXT PRIMARY KEY,
            stage TEXT NOT NULL DEFAULT 'core',
            kind TEXT NOT NULL,
            status TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            started_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,
            command_json TEXT NOT NULL,
            plan_path TEXT,
            log_path TEXT,
            error TEXT,
            plan_summary_json TEXT,
            outputs_json TEXT,
            source_run_id TEXT,
            queue_position INTEGER,
            cancel_requested BOOLEAN NOT NULL DEFAULT FALSE,
            claimed_by TEXT
        )
        """
            )
            connection.execute(
                """
        CREATE TABLE IF NOT EXISTS run_logs (
            id BIGSERIAL PRIMARY KEY,
            run_id TEXT NOT NULL,
            line TEXT NOT NULL
        )
        """
            )
            connection.execute(
                """
        CREATE TABLE IF NOT EXISTS workers (
            id TEXT PRIMARY KEY,
            heartbeat_at TIMESTAMPTZ NOT NULL,
            started_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            active_run_id TEXT
        )
        """
            )
            connection.execute(
                """
        CREATE TABLE IF NOT EXISTS config_state (
            key TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
        )
        """
            )
            connection.execute(
                """
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            subject TEXT NOT NULL UNIQUE,
            username TEXT NOT NULL,
            email TEXT,
            display_name TEXT,
            roles_json TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL
        )
        """
            )
            connection.execute(
                """
        CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            token_hash TEXT NOT NULL UNIQUE,
            subject TEXT NOT NULL,
            id_token TEXT,
            expires_at TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL,
            revoked_at TIMESTAMPTZ,
            user_agent TEXT,
            ip_address TEXT
        )
        """
            )
            connection.execute(
                """
        CREATE TABLE IF NOT EXISTS audit_events (
            id BIGSERIAL PRIMARY KEY,
            user_id TEXT,
            session_id TEXT,
            method TEXT NOT NULL,
            path TEXT NOT NULL,
            status_code INTEGER NOT NULL,
            action TEXT,
            resource_type TEXT,
            resource_id TEXT,
            details_json TEXT,
            created_at TIMESTAMPTZ NOT NULL
        )
        """
            )

            columns = {
                str(row["column_name"])
                for row in connection.execute(
                    """
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'runs'
          """
                ).fetchall()
            }
            if "stage" not in columns:
                connection.execute("ALTER TABLE runs ADD COLUMN stage TEXT NOT NULL DEFAULT 'core'")
            if "cancel_requested" not in columns:
                connection.execute("ALTER TABLE runs ADD COLUMN cancel_requested BOOLEAN NOT NULL DEFAULT FALSE")
            if "claimed_by" not in columns:
                connection.execute("ALTER TABLE runs ADD COLUMN claimed_by TEXT")
