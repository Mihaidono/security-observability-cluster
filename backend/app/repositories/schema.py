from __future__ import annotations

import time

import psycopg

from ..sql import schema as schema_sql
from .base import BaseRepository


class SchemaRepository(BaseRepository):
    _SCHEMA_INIT_LOCK_KEY_1 = 914203
    _SCHEMA_INIT_LOCK_KEY_2 = 1
    _SCHEMA_INIT_ATTEMPTS = 5

    def _initialize_database(self) -> None:
        for attempt in range(self._SCHEMA_INIT_ATTEMPTS):
            try:
                with self._connection() as connection:
                    connection.execute(
                        schema_sql.ADVISORY_LOCK,
                        (self._SCHEMA_INIT_LOCK_KEY_1, self._SCHEMA_INIT_LOCK_KEY_2),
                    )
                    connection.execute(schema_sql.CREATE_RUNS_TABLE)
                    connection.execute(schema_sql.CREATE_RUN_LOGS_TABLE)
                    connection.execute(schema_sql.CREATE_WORKERS_TABLE)
                    connection.execute(schema_sql.CREATE_CONFIG_STATE_TABLE)
                    connection.execute(schema_sql.CREATE_USERS_TABLE)
                    connection.execute(schema_sql.CREATE_SESSIONS_TABLE)
                    connection.execute(schema_sql.CREATE_AUDIT_EVENTS_TABLE)

                    columns = {
                        str(row["column_name"]) for row in connection.execute(schema_sql.SELECT_RUNS_COLUMNS).fetchall()
                    }
                    if "stage" not in columns:
                        connection.execute(schema_sql.ADD_RUNS_STAGE_COLUMN)
                    if "cancel_requested" not in columns:
                        connection.execute(schema_sql.ADD_RUNS_CANCEL_REQUESTED_COLUMN)
                    if "claimed_by" not in columns:
                        connection.execute(schema_sql.ADD_RUNS_CLAIMED_BY_COLUMN)
                return
            except psycopg.errors.UniqueViolation:
                if attempt == self._SCHEMA_INIT_ATTEMPTS - 1:
                    raise
                time.sleep(0.1 * (2**attempt))
