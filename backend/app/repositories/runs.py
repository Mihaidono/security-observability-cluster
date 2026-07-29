from __future__ import annotations

import json
import shutil
from datetime import timedelta
from pathlib import Path
from typing import Any

from psycopg.rows import dict_row

from ..models import PlanSummary, RunKind, RunStage, RunStatus, TerraformRun
from ..run_messages import canceled_run_message, interrupted_run_message
from ..sql import runs as runs_sql
from .base import BaseRepository, normalize_log_lines, utc_now


class RunRepository(BaseRepository):
    def run_dir(self, run_id: str) -> Path:
        path = self.settings.runs_dir / run_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save_run(self, run: TerraformRun) -> None:
        self.run_dir(run.id)
        with self._connection() as connection:
            connection.execute(
                runs_sql.UPSERT_RUN,
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
            row = connection.execute(runs_sql.SELECT_RUN_BY_ID, (run_id,)).fetchone()
        if row is None:
            return None
        return self._row_to_run(row)

    def list_runs(self) -> list[TerraformRun]:
        with self._connection() as connection:
            rows = connection.execute(runs_sql.SELECT_RUNS_ORDERED).fetchall()
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
            connection.execute(runs_sql.DELETE_RUN_LOGS_BY_RUN_IDS, (run_ids_to_delete,))
            connection.execute(runs_sql.DELETE_RUNS_BY_IDS, (run_ids_to_delete,))

        for run_id in run_ids_to_delete:
            shutil.rmtree(self.settings.runs_dir / run_id, ignore_errors=True)

        return runs[:keep], len(run_ids_to_delete)

    def has_nonterminal_runs(self) -> bool:
        with self._connection() as connection:
            row = connection.execute(runs_sql.SELECT_HAS_NONTERMINAL_RUNS).fetchone()
        return bool(row["exists"]) if row is not None else False

    def queue_depth(self) -> int:
        with self._connection() as connection:
            row = connection.execute(runs_sql.SELECT_QUEUE_DEPTH).fetchone()
        return int(row["count"]) if row is not None else 0

    def refresh_queue_positions(self) -> None:
        with self._connection() as connection:
            connection.execute(runs_sql.CLEAR_QUEUE_POSITIONS)
            connection.execute(runs_sql.REFRESH_QUEUE_POSITIONS)

    def is_run_claimed(self, run_id: str) -> bool:
        with self._connection() as connection:
            row = connection.execute(runs_sql.SELECT_RUN_CLAIMED, (run_id,)).fetchone()
        return bool(row["claimed"]) if row is not None else False

    def request_run_cancellation(self, run_id: str) -> None:
        with self._connection() as connection:
            connection.execute(runs_sql.REQUEST_RUN_CANCELLATION, (utc_now().isoformat(), run_id))

    def clear_run_cancellation(self, run_id: str) -> None:
        with self._connection() as connection:
            connection.execute(runs_sql.CLEAR_RUN_CANCELLATION, (run_id,))

    def is_cancel_requested(self, run_id: str) -> bool:
        with self._connection() as connection:
            row = connection.execute(runs_sql.SELECT_CANCEL_REQUESTED, (run_id,)).fetchone()
        return bool(row["cancel_requested"]) if row is not None else False

    def claim_next_queued_run(self, worker_id: str) -> TerraformRun | None:
        with self._connection() as connection:
            with connection.transaction():
                row = connection.execute(runs_sql.SELECT_NEXT_QUEUED_RUN).fetchone()
                if row is None:
                    return None
                run_id = str(row["id"])
                connection.execute(runs_sql.CLAIM_RUN, (worker_id, utc_now().isoformat(), run_id))
        self.refresh_queue_positions()
        return self.load_run(run_id)

    def clear_claim(self, run_id: str, worker_id: str | None = None) -> None:
        query = runs_sql.CLEAR_CLAIM
        params: tuple[Any, ...] = (run_id,)
        if worker_id is not None:
            query = runs_sql.CLEAR_CLAIM_BY_WORKER
            params = (run_id, worker_id)
        with self._connection() as connection:
            connection.execute(query, params)

    def touch_worker(self, worker_id: str, active_run_id: str | None = None) -> None:
        now = utc_now().isoformat()
        with self._connection() as connection:
            connection.execute(runs_sql.UPSERT_WORKER, (worker_id, now, now, now, active_run_id))

    def remove_worker(self, worker_id: str) -> None:
        with self._connection() as connection:
            connection.execute(runs_sql.DELETE_WORKER, (worker_id,))

    def worker_snapshot(self, heartbeat_ttl_seconds: int) -> tuple[bool, str | None]:
        cutoff = (utc_now() - timedelta(seconds=heartbeat_ttl_seconds)).isoformat()
        with self._connection() as connection:
            row = connection.execute(runs_sql.SELECT_WORKER_SNAPSHOT, (cutoff,)).fetchone()
        if row is None:
            return False, None
        return True, (str(row["active_run_id"]) if row["active_run_id"] else None)

    def reconcile_stale_workers(self, heartbeat_ttl_seconds: int) -> None:
        cutoff = (utc_now() - timedelta(seconds=heartbeat_ttl_seconds)).isoformat()
        with self._connection() as connection:
            stale_rows = connection.execute(runs_sql.SELECT_STALE_WORKERS, (cutoff,)).fetchall()

        stale_worker_ids = [str(row["id"]) for row in stale_rows]
        if not stale_worker_ids:
            return

        with self._connection() as connection:
            rows = connection.execute(runs_sql.SELECT_RUNS_BY_WORKER_IDS, (stale_worker_ids,)).fetchall()

        for row in rows:
            run = self._row_to_run(row)
            run.updated_at = utc_now()
            run.queue_position = None
            if run.status == RunStatus.queued:
                with self._connection() as connection:
                    connection.execute(runs_sql.UNCLAIM_QUEUED_RUN, (run.updated_at.isoformat(), run.id))
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
            connection.execute(runs_sql.DELETE_WORKERS_BY_IDS, (stale_worker_ids,))

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
            with connection.cursor() as cursor:
                cursor.executemany(
                    runs_sql.INSERT_RUN_LOG,
                    [(run_id, line) for line in cleaned_lines],
                )

    def read_logs(self, run_id: str) -> list[str]:
        with self._connection() as connection:
            rows = connection.execute(runs_sql.SELECT_RUN_LOGS, (run_id,)).fetchall()
        return [str(row["line"]) for row in rows]

    def read_logs_after(self, run_id: str, offset: int) -> list[str]:
        with self._connection() as connection:
            rows = connection.execute(runs_sql.SELECT_RUN_LOGS_AFTER_OFFSET, (run_id, offset)).fetchall()
        return [str(row["line"]) for row in rows]

    def save_json_artifact(self, run_id: str, name: str, payload: dict[str, Any]) -> Path:
        path = self.run_dir(run_id) / name
        path.write_text(json.dumps(payload, indent=2))
        return path

    def latest_outputs(self) -> dict[str, Any] | None:
        combined: dict[str, Any] = {}
        for stage in [RunStage.core, RunStage.platform, RunStage.policies, RunStage.applications]:
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
            stage=str(row["stage"] or "core"),
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
