from __future__ import annotations

from ..sql import schema as schema_sql
from .base import BaseRepository


class SchemaRepository(BaseRepository):
    _SCHEMA_INIT_LOCK_KEY_1 = 914203
    _SCHEMA_INIT_LOCK_KEY_2 = 1

    def _initialize_database(self) -> None:
        with self._connection() as connection:
            connection.execute(
                schema_sql.ADVISORY_LOCK,
                (self._SCHEMA_INIT_LOCK_KEY_1, self._SCHEMA_INIT_LOCK_KEY_2),
            )
            try:
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
            finally:
                connection.execute(
                    schema_sql.ADVISORY_UNLOCK,
                    (self._SCHEMA_INIT_LOCK_KEY_1, self._SCHEMA_INIT_LOCK_KEY_2),
                )
