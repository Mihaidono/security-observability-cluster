from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from .config import Settings
from .events import RunEventBroker
from .models import PlanSummary, RunKind, RunStage, RunStatus, TerraformRun
from .store import SqliteStore


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class RunCanceledError(RuntimeError):
    pass


class CommandFailedError(RuntimeError):
    def __init__(self, command: list[str], exit_code: int, recent_lines: list[str]) -> None:
        self.command = command
        self.exit_code = exit_code
        self.recent_lines = recent_lines
        super().__init__(build_command_error_message(command, exit_code, recent_lines))


class TerraformRunner:
    def __init__(self, settings: Settings, store: SqliteStore, broker: RunEventBroker) -> None:
        self.settings = settings
        self.store = store
        self.broker = broker
        self._queue: asyncio.Queue[str] = asyncio.Queue()
        self._queue_order: list[str] = []
        self._active_run_id: str | None = None
        self._active_process: asyncio.subprocess.Process | None = None
        self._worker_task: asyncio.Task[None] | None = None
        self._cancel_requested: set[str] = set()

    @property
    def active_run_id(self) -> str | None:
        return self._active_run_id

    @property
    def queue_depth(self) -> int:
        return len(self._queue_order)

    async def start(self) -> None:
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker_loop())

    async def stop(self) -> None:
        if self._worker_task is not None:
            self._worker_task.cancel()
            try:
                await self._worker_task
            except asyncio.CancelledError:
                pass
            self._worker_task = None

        if self._active_process is not None and self._active_process.returncode is None:
            self._active_process.terminate()

    async def start_plan(self, stage: RunStage) -> TerraformRun:
        if stage == RunStage.policies and not self._has_successful_core_apply():
            raise HTTPException(
                status_code=409,
                detail="Apply the core stage first. The policies stage expects a reachable cluster and installed CRDs.",
            )

        run_id = uuid.uuid4().hex[:12]
        run_dir = self.store.run_dir(run_id)
        command = [
            self.settings.terraform_bin,
            "plan",
            "-input=false",
            "-no-color",
            "-out",
            str(run_dir / "planned.tfplan"),
            "-var-file",
            str(self.settings.managed_tfvars_path),
        ]
        run = TerraformRun(
            id=run_id,
            stage=stage,
            kind=RunKind.plan,
            status=RunStatus.queued,
            created_at=utc_now(),
            updated_at=utc_now(),
            command=command,
            plan_path=str(run_dir / "planned.tfplan"),
            log_path=str(run_dir / "run.log"),
        )
        await self._enqueue_run(run)
        return run

    async def start_apply(self, run_id: str) -> TerraformRun:
        source_run = self.store.load_run(run_id)
        if source_run is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        if source_run.kind != RunKind.plan or source_run.status != RunStatus.planned:
            raise HTTPException(status_code=409, detail="Only a completed plan run can be applied.")
        if not source_run.plan_path:
            raise HTTPException(status_code=409, detail="The selected run does not have a saved plan file.")

        apply_run_id = uuid.uuid4().hex[:12]
        apply_run = TerraformRun(
            id=apply_run_id,
            stage=source_run.stage,
            kind=RunKind.apply,
            status=RunStatus.queued,
            created_at=utc_now(),
            updated_at=utc_now(),
            command=[
                self.settings.terraform_bin,
                "apply",
                "-input=false",
                "-json",
                source_run.plan_path,
            ],
            plan_path=source_run.plan_path,
            log_path=str(self.store.run_dir(apply_run_id) / "run.log"),
            source_run_id=source_run.id,
        )
        await self._enqueue_run(apply_run)
        return apply_run

    async def cancel_run(self, run_id: str) -> TerraformRun:
        run = self.store.load_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        if run.status in {RunStatus.applied, RunStatus.failed, RunStatus.canceled, RunStatus.planned}:
            raise HTTPException(status_code=409, detail="This run is already finished.")

        if run_id in self._queue_order:
            self._queue_order = [queued_id for queued_id in self._queue_order if queued_id != run_id]
            run.status = RunStatus.canceled
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = "Canceled before execution."
            run.queue_position = None
            await self._persist_run(run)
            await self._refresh_queue_positions()
            return run

        if self._active_run_id == run_id:
            self._cancel_requested.add(run_id)
            run.status = RunStatus.canceling
            run.updated_at = utc_now()
            run.error = "Cancellation requested."
            await self._persist_run(run)
            if self._active_process is not None and self._active_process.returncode is None:
                self._active_process.terminate()
            return run

        raise HTTPException(status_code=409, detail="The run is not queued or active.")

    async def _enqueue_run(self, run: TerraformRun) -> None:
        self.store.save_run(run)
        self._queue_order.append(run.id)
        await self._refresh_queue_positions()
        await self._publish_run(run.id)
        await self._queue.put(run.id)

    async def _refresh_queue_positions(self) -> None:
        for position, run_id in enumerate(self._queue_order, start=1):
            run = self.store.load_run(run_id)
            if run is None:
                continue
            if run.queue_position == position:
                continue
            run.queue_position = position
            run.updated_at = utc_now()
            self.store.save_run(run)
            await self._publish_run(run.id)

    async def _worker_loop(self) -> None:
        while True:
            run_id = await self._queue.get()
            try:
                if run_id in self._queue_order:
                    self._queue_order.remove(run_id)
                await self._refresh_queue_positions()

                run = self.store.load_run(run_id)
                if run is None or run.status == RunStatus.canceled:
                    continue

                self._active_run_id = run_id
                if run.kind == RunKind.plan:
                    await self._execute_plan(run)
                else:
                    await self._execute_apply(run)
            finally:
                self._active_run_id = None
                self._active_process = None
                self._cancel_requested.discard(run_id)
                self._queue.task_done()

    async def _execute_plan(self, run: TerraformRun) -> None:
        run.status = RunStatus.running
        run.started_at = utc_now()
        run.updated_at = utc_now()
        run.queue_position = None
        await self._persist_run(run)

        plan_file = Path(run.plan_path or self.store.run_dir(run.id) / "planned.tfplan")
        command = [
            self.settings.terraform_bin,
            "plan",
            "-input=false",
            "-no-color",
            "-out",
            str(plan_file),
            "-var-file",
            str(self.settings.managed_tfvars_path),
        ]
        run.command = command
        await self._persist_run(run)

        try:
            await self._stream_command(run.id, command, cwd=self._terraform_root_for_stage(run.stage))

            show_payload = await self._capture_json(
                [self.settings.terraform_bin, "show", "-json", str(plan_file)],
                cwd=self._terraform_root_for_stage(run.stage),
            )
            self.store.save_json_artifact(run.id, "plan.json", show_payload)
            run.plan_summary = summarize_plan(show_payload)
            run.status = RunStatus.planned
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = None
            await self._persist_run(run)
        except RunCanceledError as exc:
            run.status = RunStatus.canceled
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = str(exc)
            await self._persist_run(run)
        except Exception as exc:  # noqa: BLE001
            run.status = RunStatus.failed
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = str(exc)
            await self._persist_run(run)

    async def _execute_apply(self, run: TerraformRun) -> None:
        run.status = RunStatus.applying
        run.started_at = utc_now()
        run.updated_at = utc_now()
        run.queue_position = None
        await self._persist_run(run)

        command = [
            self.settings.terraform_bin,
            "apply",
            "-input=false",
            "-json",
            str(Path(run.plan_path or "")),
        ]
        run.command = command
        await self._persist_run(run)

        try:
            await self._stream_command(run.id, command, cwd=self._terraform_root_for_stage(run.stage))

            outputs_payload = await self._capture_json(
                [self.settings.terraform_bin, "output", "-json"],
                cwd=self._terraform_root_for_stage(run.stage),
            )
            run.outputs = outputs_payload
            run.status = RunStatus.applied
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = None
            await self._persist_run(run)
            self.store.save_json_artifact(run.id, "outputs.json", outputs_payload)
        except RunCanceledError as exc:
            run.status = RunStatus.canceled
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = str(exc)
            await self._persist_run(run)
        except Exception as exc:  # noqa: BLE001
            run.status = RunStatus.failed
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = str(exc)
            await self._persist_run(run)

    async def _persist_run(self, run: TerraformRun) -> None:
        self.store.save_run(run)
        await self._publish_run(run.id)

    async def _publish_run(self, run_id: str) -> None:
        run = self.store.load_run(run_id)
        if run is None:
            return
        await self.broker.publish(run_id, {"type": "run.updated", "run": run.model_dump(mode="json")})

    async def _publish_logs(self, run_id: str, lines: list[str]) -> None:
        if not lines:
            return
        await self.broker.publish(run_id, {"type": "run.logs", "lines": lines})

    async def _stream_command(self, run_id: str, command: list[str], cwd: Path) -> None:
        proc = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )
        self._active_process = proc
        recent_lines: list[str] = []

        assert proc.stdout is not None
        while True:
            raw = await proc.stdout.readline()
            if not raw:
                break
            line = raw.decode("utf-8", errors="replace").rstrip()
            if line:
                recent_lines.append(line)
                recent_lines = recent_lines[-20:]
            self.store.append_logs(run_id, [line])
            await self._publish_logs(run_id, [line])

        exit_code = await proc.wait()
        if run_id in self._cancel_requested:
            raise RunCanceledError("Run canceled by user.")
        if exit_code != 0:
            raise CommandFailedError(command, exit_code, recent_lines)

    async def _capture_json(self, command: list[str], cwd: Path) -> dict[str, Any]:
        proc = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(stderr.decode("utf-8", errors="replace").strip() or "Terraform command failed.")
        return json.loads(stdout.decode("utf-8"))

    def _terraform_root_for_stage(self, stage: RunStage) -> Path:
        if stage == RunStage.core:
            return self.settings.terraform_core_root
        return self.settings.terraform_policies_root

    def _has_successful_core_apply(self) -> bool:
        return any(
            run.stage == RunStage.core and run.kind == RunKind.apply and run.status == RunStatus.applied
            for run in self.store.list_runs()
        )


def summarize_plan(payload: dict[str, Any]) -> PlanSummary:
    create = update = delete = replace = 0
    addresses: list[str] = []

    for change in payload.get("resource_changes", []):
        actions = change.get("change", {}).get("actions", [])
        address = change.get("address")
        if address:
            addresses.append(address)

        if actions == ["create"]:
            create += 1
        elif actions == ["update"]:
            update += 1
        elif actions == ["delete"]:
            delete += 1
        elif actions == ["delete", "create"] or actions == ["create", "delete"]:
            replace += 1

    return PlanSummary(
        create=create,
        update=update,
        delete=delete,
        replace=replace,
        addresses=addresses[:50],
    )


def build_command_error_message(command: list[str], exit_code: int, recent_lines: list[str]) -> str:
    recent_output = "\n".join(line for line in recent_lines if line.strip())

    if "No valid credential sources found" in recent_output or "InvalidGrantException" in recent_output:
        return (
            "Terraform could not authenticate to AWS. "
            "Refresh the AWS credentials used by the backend process, then retry. "
            "If you use AWS SSO, run `aws sso login --profile <your-profile>` and start the backend with "
            "`AWS_PROFILE=<your-profile>`.\n\n"
            f"Recent Terraform output:\n{recent_output}"
        )

    if recent_output:
        return (
            f"{' '.join(command)} failed with exit code {exit_code}.\n\n"
            f"Recent Terraform output:\n{recent_output}"
        )

    return f"{' '.join(command)} failed with exit code {exit_code}"
