from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path
from typing import Any

from .config import Settings
from .models import PlanSummary, TerraformConfig, TerraformRun


ANSI_ESCAPE_RE = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")


def strip_ansi(value: str) -> str:
    return ANSI_ESCAPE_RE.sub("", value)


class SqliteStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.settings.state_dir.mkdir(parents=True, exist_ok=True)
        self.settings.runs_dir.mkdir(parents=True, exist_ok=True)
        self._initialize_database()

    def _connection(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.settings.database_path)
        connection.row_factory = sqlite3.Row
        return connection

    def _initialize_database(self) -> None:
        with self._connection() as connection:
            connection.executescript(
                """
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY,
                    stage TEXT NOT NULL DEFAULT 'core',
                    kind TEXT NOT NULL,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    started_at TEXT,
                    completed_at TEXT,
                    command_json TEXT NOT NULL,
                    plan_path TEXT,
                    log_path TEXT,
                    error TEXT,
                    plan_summary_json TEXT,
                    outputs_json TEXT,
                    source_run_id TEXT,
                    queue_position INTEGER
                );

                CREATE TABLE IF NOT EXISTS run_logs (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT NOT NULL,
                    line TEXT NOT NULL
                );
                """
            )
            columns = {
                str(row["name"])
                for row in connection.execute("PRAGMA table_info(runs)").fetchall()
            }
            if "stage" not in columns:
                connection.execute("ALTER TABLE runs ADD COLUMN stage TEXT NOT NULL DEFAULT 'core'")

    def load_default_config(self) -> TerraformConfig:
        return TerraformConfig.model_validate_json(self.settings.default_config_path.read_text())

    def load_config(self) -> TerraformConfig:
        path = self.settings.managed_tfvars_path
        if not path.exists():
            default_config = self.load_default_config()
            self.save_config(default_config)
            return default_config
        return TerraformConfig.model_validate_json(path.read_text())

    def save_config(self, config: TerraformConfig) -> None:
        payload = json.dumps(config.model_dump(mode="json"), indent=2)
        self.settings.managed_tfvars_path.write_text(f"{payload}\n")

    def reset_config(self) -> TerraformConfig:
        config = self.load_default_config()
        self.save_config(config)
        return config

    def run_dir(self, run_id: str) -> Path:
        path = self.settings.runs_dir / run_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save_run(self, run: TerraformRun) -> None:
        self.run_dir(run.id)
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO runs (
                    id, stage, kind, status, created_at, updated_at, started_at, completed_at,
                    command_json, plan_path, log_path, error, plan_summary_json, outputs_json,
                    source_run_id, queue_position
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                """,
                (
                    run.id,
                    run.stage.value,
                    run.kind.value,
                    run.status.value,
                    run.created_at.isoformat(),
                    run.updated_at.isoformat(),
                    run.started_at.isoformat() if run.started_at else None,
                    run.completed_at.isoformat() if run.completed_at else None,
                    json.dumps(run.command),
                    run.plan_path,
                    run.log_path,
                    run.error,
                    json.dumps(run.plan_summary.model_dump(mode="json")) if run.plan_summary else None,
                    json.dumps(run.outputs) if run.outputs else None,
                    run.source_run_id,
                    run.queue_position,
                ),
            )

    def load_run(self, run_id: str) -> TerraformRun | None:
        with self._connection() as connection:
            row = connection.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
        if row is None:
            return None
        return self._row_to_run(row)

    def list_runs(self) -> list[TerraformRun]:
        with self._connection() as connection:
            rows = connection.execute("SELECT * FROM runs ORDER BY created_at DESC").fetchall()
        return [self._row_to_run(row) for row in rows]

    def append_logs(self, run_id: str, lines: list[str]) -> None:
        if not lines:
            return
        cleaned_lines = [strip_ansi(line) for line in lines]
        log_path = self.run_dir(run_id) / "run.log"
        with log_path.open("a", encoding="utf-8") as handle:
            for line in cleaned_lines:
                handle.write(f"{line}\n")
        with self._connection() as connection:
            connection.executemany(
                "INSERT INTO run_logs (run_id, line) VALUES (?, ?)",
                [(run_id, line) for line in cleaned_lines],
            )

    def read_logs(self, run_id: str) -> list[str]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT line FROM run_logs WHERE run_id = ? ORDER BY id ASC",
                (run_id,),
            ).fetchall()
        return [str(row["line"]) for row in rows]

    def save_json_artifact(self, run_id: str, name: str, payload: dict[str, Any]) -> Path:
        path = self.run_dir(run_id) / name
        path.write_text(json.dumps(payload, indent=2))
        return path

    def latest_outputs(self) -> dict[str, Any] | None:
        with self._connection() as connection:
            row = connection.execute(
                """
                SELECT outputs_json FROM runs
                WHERE outputs_json IS NOT NULL
                  AND stage = 'core'
                  AND status = 'applied'
                ORDER BY updated_at DESC
                LIMIT 1
                """
            ).fetchone()
            if row is None:
                row = connection.execute(
                    """
                    SELECT outputs_json FROM runs
                    WHERE outputs_json IS NOT NULL
                      AND status = 'applied'
                    ORDER BY updated_at DESC
                    LIMIT 1
                    """
                ).fetchone()
        if row is None or row["outputs_json"] is None:
            return None
        return json.loads(str(row["outputs_json"]))

    def _row_to_run(self, row: sqlite3.Row) -> TerraformRun:
        plan_summary = None
        if row["plan_summary_json"]:
            plan_summary = PlanSummary.model_validate(json.loads(str(row["plan_summary_json"])))

        outputs = json.loads(str(row["outputs_json"])) if row["outputs_json"] else None

        return TerraformRun(
            id=str(row["id"]),
            stage=str(row["stage"]) if row["stage"] else "core",
            kind=str(row["kind"]),
            status=str(row["status"]),
            created_at=str(row["created_at"]),
            updated_at=str(row["updated_at"]),
            started_at=str(row["started_at"]) if row["started_at"] else None,
            completed_at=str(row["completed_at"]) if row["completed_at"] else None,
            command=json.loads(str(row["command_json"])),
            plan_path=str(row["plan_path"]) if row["plan_path"] else None,
            log_path=str(row["log_path"]) if row["log_path"] else None,
            error=str(row["error"]) if row["error"] else None,
            plan_summary=plan_summary,
            outputs=outputs,
            source_run_id=str(row["source_run_id"]) if row["source_run_id"] else None,
            queue_position=int(row["queue_position"]) if row["queue_position"] is not None else None,
        )
