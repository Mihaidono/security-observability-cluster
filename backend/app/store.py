from __future__ import annotations

import json
import re
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import psycopg
from psycopg.rows import dict_row

from .config import Settings
from .models import PlanSummary, RunKind, RunStage, RunStatus, TerraformConfig, TerraformRun
from .run_messages import canceled_run_message, interrupted_run_message


ANSI_ESCAPE_RE = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def strip_ansi(value: str) -> str:
    return ANSI_ESCAPE_RE.sub("", value)


def normalize_log_lines(lines: list[str]) -> list[str]:
    normalized: list[str] = []
    previous_blank = False

    for raw_line in lines:
        line = strip_ansi(raw_line).rstrip()
        is_blank = line.strip() == ""
        if is_blank:
            if previous_blank:
                continue
            previous_blank = True
            continue
        previous_blank = False
        normalized.append(line)

    return normalized


class PostgresStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.settings.state_dir.mkdir(parents=True, exist_ok=True)
        self.settings.runs_dir.mkdir(parents=True, exist_ok=True)
        self._initialize_database()

    def _connection(self) -> psycopg.Connection:
        return psycopg.connect(self.settings.database_url, row_factory=dict_row)

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

            connection.execute("UPDATE runs SET stage = 'platform' WHERE stage = 'policies'")

    def load_default_config(self) -> TerraformConfig:
        return TerraformConfig.model_validate_json(self.settings.default_config_path.read_text())

    def load_config(self) -> TerraformConfig:
        path = self.settings.managed_config_path
        if not path.exists():
            legacy_path = self.settings.infrastructure_root / "frontend-managed.auto.tfvars.json"
            if legacy_path.exists():
                config = TerraformConfig.model_validate_json(legacy_path.read_text())
                self.save_config(config)
                return config
            default_config = self.load_default_config()
            self.save_config(default_config)
            return default_config
        config = TerraformConfig.model_validate_json(path.read_text())
        if not all(
            stage_path.exists()
            for stage_path in [
                self.settings.core_tfvars_path,
                self.settings.platform_tfvars_path,
                self.settings.applications_tfvars_path,
            ]
        ):
            self.save_config(config)
        return config

    def save_config(self, config: TerraformConfig) -> None:
        payload = json.dumps(config.model_dump(mode="json"), indent=2)
        self.settings.managed_config_path.write_text(f"{payload}\n")
        self.settings.core_tfvars_path.write_text(f"{json.dumps(core_tfvars_payload(config), indent=2)}\n")
        self.settings.platform_tfvars_path.write_text(f"{json.dumps(platform_tfvars_payload(config), indent=2)}\n")
        self.settings.applications_tfvars_path.write_text(
            f"{json.dumps(applications_tfvars_payload(config), indent=2)}\n"
        )

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
                    (json.dumps(run.plan_summary.model_dump(mode="json")) if run.plan_summary else None),
                    json.dumps(run.outputs) if run.outputs else None,
                    run.source_run_id,
                    run.queue_position,
                    run.id,
                ),
            )

    def enqueue_run(self, run: TerraformRun) -> TerraformRun:
        self.save_run(run)
        self.refresh_queue_positions()
        queued = self.load_run(run.id)
        if queued is None:
            raise RuntimeError(f"Queued run {run.id} could not be reloaded.")
        return queued

    def load_run(self, run_id: str) -> TerraformRun | None:
        with self._connection() as connection:
            row = connection.execute("SELECT * FROM runs WHERE id = %s", (run_id,)).fetchone()
        if row is None:
            return None
        return self._row_to_run(row)

    def list_runs(self) -> list[TerraformRun]:
        with self._connection() as connection:
            rows = connection.execute("SELECT * FROM runs ORDER BY created_at DESC").fetchall()
        return [self._row_to_run(row) for row in rows]

    def prune_runs(self, keep: int) -> tuple[list[TerraformRun], int]:
        runs = self.list_runs()
        if keep < 0:
            keep = 0

        runs_to_delete = runs[keep:]
        if not runs_to_delete:
            return runs, 0

        run_ids_to_delete = [run.id for run in runs_to_delete]
        with self._connection() as connection:
            connection.executemany(
                "DELETE FROM run_logs WHERE run_id = %s", [(run_id,) for run_id in run_ids_to_delete]
            )
            connection.executemany("DELETE FROM runs WHERE id = %s", [(run_id,) for run_id in run_ids_to_delete])

        for run_id in run_ids_to_delete:
            shutil.rmtree(self.settings.runs_dir / run_id, ignore_errors=True)

        return runs[:keep], len(run_ids_to_delete)

    def has_nonterminal_runs(self) -> bool:
        with self._connection() as connection:
            row = connection.execute(
                """
                SELECT EXISTS(
                    SELECT 1
                    FROM runs
                    WHERE status IN ('queued', 'running', 'applying', 'destroying', 'canceling')
                ) AS exists
                """
            ).fetchone()
        return bool(row["exists"]) if row is not None else False

    def queue_depth(self) -> int:
        with self._connection() as connection:
            row = connection.execute(
                """
                SELECT COUNT(*) AS count
                FROM runs
                WHERE status = 'queued' AND cancel_requested = FALSE AND claimed_by IS NULL
                """
            ).fetchone()
        return int(row["count"]) if row is not None else 0

    def refresh_queue_positions(self) -> None:
        with self._connection() as connection:
            connection.execute(
                "UPDATE runs SET queue_position = NULL WHERE status <> 'queued' OR cancel_requested = TRUE OR claimed_by IS NOT NULL"
            )
            connection.execute(
                """
                WITH ranked AS (
                    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS position
                    FROM runs
                    WHERE status = 'queued' AND cancel_requested = FALSE AND claimed_by IS NULL
                )
                UPDATE runs AS target
                SET queue_position = ranked.position
                FROM ranked
                WHERE target.id = ranked.id
                """
            )

    def is_run_claimed(self, run_id: str) -> bool:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT claimed_by IS NOT NULL AS claimed FROM runs WHERE id = %s", (run_id,)
            ).fetchone()
        return bool(row["claimed"]) if row is not None else False

    def request_run_cancellation(self, run_id: str) -> None:
        with self._connection() as connection:
            connection.execute(
                "UPDATE runs SET cancel_requested = TRUE, updated_at = %s WHERE id = %s",
                (utc_now().isoformat(), run_id),
            )

    def clear_run_cancellation(self, run_id: str) -> None:
        with self._connection() as connection:
            connection.execute("UPDATE runs SET cancel_requested = FALSE WHERE id = %s", (run_id,))

    def is_cancel_requested(self, run_id: str) -> bool:
        with self._connection() as connection:
            row = connection.execute("SELECT cancel_requested FROM runs WHERE id = %s", (run_id,)).fetchone()
        return bool(row["cancel_requested"]) if row is not None else False

    def claim_next_queued_run(self, worker_id: str) -> TerraformRun | None:
        with self._connection() as connection:
            with connection.transaction():
                row = connection.execute(
                    """
                    SELECT id
                    FROM runs
                    WHERE status = 'queued' AND cancel_requested = FALSE AND claimed_by IS NULL
                    ORDER BY created_at ASC
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1
                    """
                ).fetchone()
                if row is None:
                    return None
                run_id = str(row["id"])
                connection.execute(
                    "UPDATE runs SET claimed_by = %s, queue_position = NULL, updated_at = %s WHERE id = %s",
                    (worker_id, utc_now().isoformat(), run_id),
                )
        self.refresh_queue_positions()
        return self.load_run(run_id)

    def clear_claim(self, run_id: str, worker_id: str | None = None) -> None:
        query = "UPDATE runs SET claimed_by = NULL, cancel_requested = FALSE WHERE id = %s"
        params: tuple[Any, ...] = (run_id,)
        if worker_id is not None:
            query = "UPDATE runs SET claimed_by = NULL, cancel_requested = FALSE WHERE id = %s AND claimed_by = %s"
            params = (run_id, worker_id)
        with self._connection() as connection:
            connection.execute(query, params)

    def touch_worker(self, worker_id: str, active_run_id: str | None = None) -> None:
        now = utc_now().isoformat()
        with self._connection() as connection:
            connection.execute(
                """
                INSERT INTO workers (id, heartbeat_at, started_at, updated_at, active_run_id)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT(id) DO UPDATE SET
                    heartbeat_at = excluded.heartbeat_at,
                    updated_at = excluded.updated_at,
                    active_run_id = excluded.active_run_id
                """,
                (worker_id, now, now, now, active_run_id),
            )

    def remove_worker(self, worker_id: str) -> None:
        with self._connection() as connection:
            connection.execute("DELETE FROM workers WHERE id = %s", (worker_id,))

    def worker_snapshot(self, heartbeat_ttl_seconds: int) -> tuple[bool, str | None]:
        cutoff = (utc_now() - timedelta(seconds=heartbeat_ttl_seconds)).isoformat()
        with self._connection() as connection:
            row = connection.execute(
                """
                SELECT id, active_run_id
                FROM workers
                WHERE heartbeat_at >= %s
                ORDER BY heartbeat_at DESC
                LIMIT 1
                """,
                (cutoff,),
            ).fetchone()
        if row is None:
            return False, None
        return True, (str(row["active_run_id"]) if row["active_run_id"] else None)

    def reconcile_stale_workers(self, heartbeat_ttl_seconds: int) -> None:
        cutoff = (utc_now() - timedelta(seconds=heartbeat_ttl_seconds)).isoformat()
        with self._connection() as connection:
            stale_rows = connection.execute("SELECT id FROM workers WHERE heartbeat_at < %s", (cutoff,)).fetchall()

        stale_worker_ids = [str(row["id"]) for row in stale_rows]
        if not stale_worker_ids:
            return

        with self._connection() as connection:
            rows = connection.execute(
                """
                SELECT *
                FROM runs
                WHERE claimed_by = ANY(%s)
                ORDER BY created_at ASC
                """,
                (stale_worker_ids,),
            ).fetchall()

        for row in rows:
            run = self._row_to_run(row)
            run.updated_at = utc_now()
            run.queue_position = None
            if run.status == RunStatus.queued:
                with self._connection() as connection:
                    connection.execute(
                        "UPDATE runs SET claimed_by = NULL, updated_at = %s WHERE id = %s",
                        (run.updated_at.isoformat(), run.id),
                    )
                continue

            if run.status == RunStatus.canceling:
                run.status = RunStatus.canceled
                run.completed_at = utc_now()
                run.error = canceled_run_message(run.kind)
            elif run.status in {RunStatus.running, RunStatus.applying, RunStatus.destroying}:
                run.status = RunStatus.failed
                run.completed_at = utc_now()
                run.error = interrupted_run_message(run.kind)
            else:
                continue

            self.save_run(run)
            self.clear_claim(run.id)

        with self._connection() as connection:
            connection.execute("DELETE FROM workers WHERE id = ANY(%s)", (stale_worker_ids,))

        self.refresh_queue_positions()

    def append_logs(self, run_id: str, lines: list[str]) -> None:
        if not lines:
            return
        cleaned_lines = normalize_log_lines(lines)
        if not cleaned_lines:
            return
        log_path = self.run_dir(run_id) / "run.log"
        with log_path.open("a", encoding="utf-8") as handle:
            for line in cleaned_lines:
                handle.write(f"{line}\n")
        with self._connection() as connection:
            connection.executemany(
                "INSERT INTO run_logs (run_id, line) VALUES (%s, %s)", [(run_id, line) for line in cleaned_lines]
            )

    def read_logs(self, run_id: str) -> list[str]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT line FROM run_logs WHERE run_id = %s ORDER BY id ASC",
                (run_id,),
            ).fetchall()
        return [str(row["line"]) for row in rows]

    def read_logs_after(self, run_id: str, offset: int) -> list[str]:
        with self._connection() as connection:
            rows = connection.execute(
                "SELECT line FROM run_logs WHERE run_id = %s ORDER BY id ASC OFFSET %s",
                (run_id, offset),
            ).fetchall()
        return [str(row["line"]) for row in rows]

    def save_json_artifact(self, run_id: str, name: str, payload: dict[str, Any]) -> Path:
        path = self.run_dir(run_id) / name
        path.write_text(json.dumps(payload, indent=2))
        return path

    def latest_outputs(self) -> dict[str, Any] | None:
        combined: dict[str, Any] = {}
        for stage in [RunStage.core, RunStage.platform, RunStage.applications]:
            run = self._latest_effective_apply(stage)
            if run and run.outputs:
                combined.update(run.outputs)
        return combined or None

    def _latest_effective_apply(self, stage: RunStage) -> TerraformRun | None:
        for run in self.list_runs():
            if run.stage != stage or run.kind not in {RunKind.apply, RunKind.destroy}:
                continue
            if run.kind == RunKind.destroy and run.status == RunStatus.destroyed:
                return None
            if run.kind == RunKind.apply and run.status == RunStatus.applied and run.outputs is not None:
                return run
        return None

    def _row_to_run(self, row: dict[str, Any]) -> TerraformRun:
        plan_summary = None
        if row["plan_summary_json"]:
            plan_summary = PlanSummary.model_validate(json.loads(str(row["plan_summary_json"])))

        outputs = json.loads(str(row["outputs_json"])) if row["outputs_json"] else None

        return TerraformRun(
            id=str(row["id"]),
            stage="platform" if str(row["stage"]) == "policies" else str(row["stage"] or "core"),
            kind=str(row["kind"]),
            status=str(row["status"]),
            created_at=row["created_at"],
            updated_at=row["updated_at"],
            started_at=row["started_at"],
            completed_at=row["completed_at"],
            command=json.loads(str(row["command_json"])),
            plan_path=str(row["plan_path"]) if row["plan_path"] else None,
            log_path=str(row["log_path"]) if row["log_path"] else None,
            error=str(row["error"]) if row["error"] else None,
            plan_summary=plan_summary,
            outputs=outputs,
            source_run_id=str(row["source_run_id"]) if row["source_run_id"] else None,
            queue_position=(int(row["queue_position"]) if row["queue_position"] is not None else None),
        )


def core_tfvars_payload(config: TerraformConfig) -> dict[str, Any]:
    return {
        "project_name": config.core.project_name,
        "environment": config.core.environment,
        "cluster_name": config.core.cluster_name,
        "kubernetes_version": config.core.kubernetes_version,
        "cluster_log_retention_in_days": config.core.cluster_log_retention_in_days,
        "cluster_admin_principal_arns": config.core.cluster_admin_principal_arns,
    }


def platform_tfvars_payload(config: TerraformConfig) -> dict[str, Any]:
    return {
        "project_name": config.core.project_name,
        "environment": config.core.environment,
        "cluster_name": config.core.cluster_name,
        "kubernetes_version": config.core.kubernetes_version,
        "cluster_admin_principal_arns": config.core.cluster_admin_principal_arns,
        "analysis_subjects": config.platform.analysis_subjects,
    }


def applications_tfvars_payload(config: TerraformConfig) -> dict[str, Any]:
    return {
        "project_name": config.core.project_name,
        "environment": config.core.environment,
        "cluster_name": config.core.cluster_name,
        "cluster_admin_principal_arns": config.core.cluster_admin_principal_arns,
        "analysis_subjects": config.platform.analysis_subjects,
        "ward_applications": config.applications.ward_applications,
    }
