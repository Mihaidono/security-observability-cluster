from __future__ import annotations

import asyncio
import json
import os
import re
import signal
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from .config import Settings
from .events import RunEventBroker
from .models import PlanSummary, RunKind, RunStage, RunStatus, StateLockInfo, TerraformRun, UnlockStateResponse
from .store import SqliteStore, strip_ansi


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class RunCanceledError(RuntimeError):
    pass


class CommandFailedError(RuntimeError):
    def __init__(self, command: list[str], exit_code: int, recent_lines: list[str]) -> None:
        self.command = command
        self.exit_code = exit_code
        self.recent_lines = [strip_ansi(line) for line in recent_lines]
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
        self._stopping = False

    @property
    def active_run_id(self) -> str | None:
        return self._active_run_id

    @property
    def queue_depth(self) -> int:
        return len(self._queue_order)

    @property
    def worker_running(self) -> bool:
        return self._worker_task is not None and not self._worker_task.done()

    async def start(self) -> None:
        self._stopping = False
        await self._reconcile_incomplete_runs()
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker_loop())

    async def stop(self) -> None:
        self._stopping = True

        if self._worker_task is not None:
            self._worker_task.cancel()
        await self._terminate_active_process()
        if self._worker_task is not None:
            try:
                await asyncio.wait_for(self._worker_task, timeout=8)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass
            self._worker_task = None
        self._active_process = None

    async def start_plan(self, stage: RunStage) -> TerraformRun:
        self._require_cluster_admin_access()

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
        self._require_cluster_admin_access()

        source_run = self.store.load_run(run_id)
        if source_run is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        if source_run.kind != RunKind.plan or source_run.status != RunStatus.planned:
            raise HTTPException(status_code=409, detail="Only a completed plan run can be applied.")
        if not source_run.plan_path:
            raise HTTPException(status_code=409, detail="The selected run does not have a saved plan file.")
        if self._has_apply_attempt_for_plan(source_run.id):
            raise HTTPException(
                status_code=409,
                detail="This saved plan has already been used for an apply attempt. Create a fresh plan before applying again.",
            )

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

    async def start_destroy(self, stage: RunStage) -> TerraformRun:
        self._require_cluster_admin_access()

        if stage == RunStage.core and self._has_active_policies_stage():
            raise HTTPException(
                status_code=409,
                detail="Destroy the policies stage first. The core stage owns the cluster the policies stage depends on.",
            )

        destroy_run_id = uuid.uuid4().hex[:12]
        command = [
            self.settings.terraform_bin,
            "destroy",
            "-auto-approve",
            "-input=false",
            "-no-color",
            "-var-file",
            str(self.settings.managed_tfvars_path),
        ]
        run = TerraformRun(
            id=destroy_run_id,
            stage=stage,
            kind=RunKind.destroy,
            status=RunStatus.queued,
            created_at=utc_now(),
            updated_at=utc_now(),
            command=command,
            log_path=str(self.store.run_dir(destroy_run_id) / "run.log"),
        )
        await self._enqueue_run(run)
        return run

    async def unlock_state(self, stage: RunStage) -> UnlockStateResponse:
        if self._active_run_id is not None or self._queue_order:
            raise HTTPException(
                status_code=409,
                detail="Cannot unlock state while another run is active or queued. Wait for the queue to drain first.",
            )

        lock_context = self._find_recent_lock_for_stage(stage)
        if lock_context is None:
            raise HTTPException(
                status_code=404,
                detail=(
                    f"No stale lock details were found for the {stage.value} stage. "
                    "Trigger a fresh run first, or unlock manually with Terraform if you already know the lock ID."
                ),
            )

        source_run, lock_info = lock_context

        await self._ensure_stage_initialized(stage)
        command = [self.settings.terraform_bin, "force-unlock", "-force", lock_info.id]
        proc = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(self._terraform_root_for_stage(stage)),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
        )
        self._active_process = proc
        try:
            stdout, stderr = await proc.communicate()
            stdout_text = strip_ansi(stdout.decode("utf-8", errors="replace").strip())
            stderr_text = strip_ansi(stderr.decode("utf-8", errors="replace").strip())
            if proc.returncode != 0:
                message = stderr_text or stdout_text or "Terraform force-unlock failed."
                raise HTTPException(status_code=409, detail=explain_terraform_output(message) or message)
            detail = stdout_text or f"Unlocked stale state lock {lock_info.id} for the {stage.value} stage."
            return UnlockStateResponse(
                stage=stage,
                unlocked=True,
                detail=detail,
                lock=lock_info,
                source_run_id=source_run.id,
            )
        finally:
            if self._active_process is proc:
                self._active_process = None

    async def cancel_run(self, run_id: str) -> TerraformRun:
        run = self.store.load_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        if run.status == RunStatus.canceling:
            return run
        if run.status in {RunStatus.applied, RunStatus.destroyed, RunStatus.failed, RunStatus.canceled, RunStatus.planned}:
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
            await self._terminate_active_process()
            return run

        if run.status in {RunStatus.running, RunStatus.applying, RunStatus.destroying}:
            run.status = RunStatus.failed
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.queue_position = None
            run.error = interrupted_run_message(run.kind)
            await self._persist_run(run)
            await self._append_internal_log(
                run.id,
                "Reconciled stale run state after cancellation was requested for a run that was no longer queued or active.",
            )
            return run

        raise HTTPException(status_code=409, detail="The run is not queued or active.")

    async def _enqueue_run(self, run: TerraformRun) -> None:
        if self._worker_task is None or self._worker_task.done():
            self._worker_task = asyncio.create_task(self._worker_loop())
        self.store.save_run(run)
        self._queue_order.append(run.id)
        await self._refresh_queue_positions()
        await self._publish_run(run.id)
        await self._queue.put(run.id)

    async def _reconcile_incomplete_runs(self) -> None:
        now = utc_now()
        for run in self.store.list_runs():
            if run.status == RunStatus.queued:
                run.status = RunStatus.canceled
                run.completed_at = now
                run.updated_at = now
                run.queue_position = None
                run.error = "Canceled because the backend restarted before execution began."
                await self._persist_run(run)
                continue

            if run.status == RunStatus.canceling:
                run.status = RunStatus.canceled
                run.completed_at = now
                run.updated_at = now
                run.queue_position = None
                run.error = canceled_run_message(run.kind)
                await self._persist_run(run)
                continue

            if run.status in {RunStatus.running, RunStatus.applying, RunStatus.destroying}:
                run.status = RunStatus.failed
                run.completed_at = now
                run.updated_at = now
                run.queue_position = None
                run.error = interrupted_run_message(run.kind)
                await self._persist_run(run)

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
            run_id: str | None = None
            try:
                run_id = await self._queue.get()
                if run_id in self._queue_order:
                    self._queue_order.remove(run_id)
                await self._refresh_queue_positions()

                run = self.store.load_run(run_id)
                if run is None or run.status == RunStatus.canceled:
                    continue

                self._active_run_id = run_id
                try:
                    if run.kind == RunKind.plan:
                        await self._execute_plan(run)
                    elif run.kind == RunKind.apply:
                        await self._execute_apply(run)
                    else:
                        await self._execute_destroy(run)
                except Exception as exc:  # noqa: BLE001
                    latest = self.store.load_run(run_id)
                    if latest is not None and latest.status in {
                        RunStatus.running,
                        RunStatus.applying,
                        RunStatus.destroying,
                    }:
                        latest.status = RunStatus.failed
                        latest.completed_at = utc_now()
                        latest.updated_at = utc_now()
                        latest.queue_position = None
                        latest.error = strip_ansi(str(exc))
                        await self._persist_run(latest)
                    await self._append_internal_log(
                        run_id,
                        strip_ansi(f"Runner recovered from an unhandled execution error: {exc}"),
                    )
            except asyncio.CancelledError:
                break
            finally:
                self._active_run_id = None
                self._active_process = None
                if run_id is not None:
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
        self._raise_if_canceled(run.id)

        try:
            await self._ensure_stage_initialized(run.stage, run.id)
            await self._stream_command(run.id, command, cwd=self._terraform_root_for_stage(run.stage))

            run.status = RunStatus.planned
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = None
            await self._persist_run(run)

            try:
                show_payload = await self._capture_json(
                    [self.settings.terraform_bin, "show", "-json", str(plan_file)],
                    cwd=self._terraform_root_for_stage(run.stage),
                    run_id=run.id,
                )
            except RunCanceledError:
                await self._append_internal_log(run.id, "Plan completed successfully, but summary generation was canceled.")
            except Exception as exc:  # noqa: BLE001
                await self._append_internal_log(run.id, f"Plan completed successfully, but summary generation failed: {exc}")
            else:
                self.store.save_json_artifact(run.id, "plan.json", show_payload)
                run.plan_summary = summarize_plan(show_payload)
                run.updated_at = utc_now()
                await self._persist_run(run)
        except RunCanceledError as exc:
            run.status = RunStatus.canceled
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = canceled_run_message(run.kind)
            await self._persist_run(run)
        except Exception as exc:  # noqa: BLE001
            run.status = RunStatus.failed
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = strip_ansi(str(exc))
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
        self._raise_if_canceled(run.id)

        try:
            await self._ensure_stage_initialized(run.stage, run.id)
            await self._stream_command(run.id, command, cwd=self._terraform_root_for_stage(run.stage))

            run.status = RunStatus.applied
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = None
            await self._persist_run(run)

            try:
                outputs_payload = await self._capture_json(
                    [self.settings.terraform_bin, "output", "-json"],
                    cwd=self._terraform_root_for_stage(run.stage),
                    run_id=run.id,
                )
            except RunCanceledError:
                await self._append_internal_log(run.id, "Apply completed successfully, but output collection was canceled.")
            except Exception as exc:  # noqa: BLE001
                await self._append_internal_log(run.id, f"Apply completed successfully, but output collection failed: {exc}")
            else:
                run.outputs = outputs_payload
                run.updated_at = utc_now()
                await self._persist_run(run)
                self.store.save_json_artifact(run.id, "outputs.json", outputs_payload)
        except CommandFailedError as exc:
            if self._is_core_bootstrap_auth_delay(run, exc):
                await self._append_internal_log(
                    run.id,
                    "Detected initial EKS bootstrap authorization delay. The run is stopping here to preserve the reviewed plan. Wait for access propagation, then create a fresh plan and apply again.",
                )

            run.status = RunStatus.failed
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = strip_ansi(str(exc))
            await self._persist_run(run)
        except RunCanceledError as exc:
            run.status = RunStatus.canceled
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = canceled_run_message(run.kind)
            await self._persist_run(run)
        except Exception as exc:  # noqa: BLE001
            run.status = RunStatus.failed
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = strip_ansi(str(exc))
            await self._persist_run(run)

    async def _execute_destroy(self, run: TerraformRun) -> None:
        run.status = RunStatus.destroying
        run.started_at = utc_now()
        run.updated_at = utc_now()
        run.queue_position = None
        await self._persist_run(run)

        command = [
            self.settings.terraform_bin,
            "destroy",
            "-auto-approve",
            "-input=false",
            "-no-color",
            "-var-file",
            str(self.settings.managed_tfvars_path),
        ]
        run.command = command
        await self._persist_run(run)
        self._raise_if_canceled(run.id)

        try:
            await self._ensure_stage_initialized(run.stage, run.id)
            await self._stream_command(run.id, command, cwd=self._terraform_root_for_stage(run.stage))

            run.outputs = {} if run.stage == RunStage.core else None
            run.status = RunStatus.destroyed
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = None
            await self._persist_run(run)
        except RunCanceledError as exc:
            run.status = RunStatus.canceled
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = canceled_run_message(run.kind)
            await self._persist_run(run)
        except Exception as exc:  # noqa: BLE001
            run.status = RunStatus.failed
            run.completed_at = utc_now()
            run.updated_at = utc_now()
            run.error = strip_ansi(str(exc))
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

    async def _append_internal_log(self, run_id: str, line: str) -> None:
        self.store.append_logs(run_id, [line])
        await self._publish_logs(run_id, [line])

    async def _ensure_stage_initialized(self, stage: RunStage, run_id: str | None = None) -> None:
        if run_id is not None:
            self._raise_if_canceled(run_id)
        cwd = self._terraform_root_for_stage(stage)
        backend_config = cwd / "backend.hcl"

        command = [self.settings.terraform_bin, "init", "-reconfigure"]
        if backend_config.exists():
            command.extend(["-backend-config", str(backend_config)])

        proc = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
        )
        self._active_process = proc
        try:
            stdout, stderr = await proc.communicate()
            stdout_lines = stdout.decode("utf-8", errors="replace").splitlines()
            stderr_lines = stderr.decode("utf-8", errors="replace").splitlines()
            if run_id is not None:
                combined_lines = stdout_lines + stderr_lines
                if combined_lines:
                    self.store.append_logs(run_id, combined_lines)
                    await self._publish_logs(run_id, combined_lines)
            if self._stopping or (run_id is not None and run_id in self._cancel_requested):
                raise RunCanceledError("Run canceled by user.")
            if proc.returncode != 0:
                stderr_text = "\n".join(stderr_lines).strip()
                stdout_text = "\n".join(stdout_lines).strip()
                message = stderr_text or stdout_text or "Terraform init failed."
                cleaned_message = strip_ansi(message)
                raise RuntimeError(explain_terraform_output(cleaned_message) or cleaned_message)
        except asyncio.CancelledError:
            await self._terminate_active_process()
            raise
        finally:
            if self._active_process is proc:
                self._active_process = None

    async def _stream_command(self, run_id: str, command: list[str], cwd: Path) -> None:
        self._raise_if_canceled(run_id)
        proc = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            start_new_session=True,
        )
        self._active_process = proc
        recent_lines: list[str] = []

        try:
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
            if run_id in self._cancel_requested or self._stopping:
                raise RunCanceledError("Run canceled by user.")
            if exit_code != 0:
                raise CommandFailedError(command, exit_code, recent_lines)
        except asyncio.CancelledError:
            await self._terminate_active_process()
            raise
        finally:
            if self._active_process is proc:
                self._active_process = None

    async def _capture_json(self, command: list[str], cwd: Path, run_id: str | None = None) -> dict[str, Any]:
        if run_id is not None:
            self._raise_if_canceled(run_id)
        proc = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            start_new_session=True,
        )
        self._active_process = proc
        try:
            stdout, stderr = await proc.communicate()
            if self._stopping or (run_id is not None and run_id in self._cancel_requested):
                raise RunCanceledError("Run canceled by user.")
            if proc.returncode != 0:
                cleaned_message = strip_ansi(stderr.decode("utf-8", errors="replace").strip() or "Terraform command failed.")
                raise RuntimeError(explain_terraform_output(cleaned_message) or cleaned_message)
            return json.loads(stdout.decode("utf-8"))
        except asyncio.CancelledError:
            await self._terminate_active_process()
            raise
        finally:
            if self._active_process is proc:
                self._active_process = None

    async def _terminate_active_process(self) -> None:
        proc = self._active_process
        if proc is None or proc.returncode is not None:
            return

        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except ProcessLookupError:
            return

        try:
            await asyncio.wait_for(proc.wait(), timeout=8)
            return
        except (asyncio.TimeoutError, ProcessLookupError):
            pass

        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            return

        try:
            await asyncio.wait_for(proc.wait(), timeout=3)
        except (asyncio.TimeoutError, ProcessLookupError):
            pass
        finally:
            if self._active_process is proc:
                self._active_process = None

    def _terraform_root_for_stage(self, stage: RunStage) -> Path:
        if stage == RunStage.core:
            return self.settings.terraform_core_root
        return self.settings.terraform_policies_root

    def _find_recent_lock_for_stage(self, stage: RunStage) -> tuple[TerraformRun, StateLockInfo] | None:
        for run in self.store.list_runs():
            if run.stage != stage:
                continue
            for candidate in [run.error, "\n".join(self.store.read_logs(run.id))]:
                if not candidate:
                    continue
                lock_info = extract_lock_info(candidate)
                if lock_info is not None:
                    return run, lock_info
        return None

    def _has_successful_core_apply(self) -> bool:
        return any(
            run.stage == RunStage.core and run.kind == RunKind.apply and run.status == RunStatus.applied
            for run in self.store.list_runs()
        )

    def _has_apply_attempt_for_plan(self, plan_run_id: str) -> bool:
        return any(run.kind == RunKind.apply and run.source_run_id == plan_run_id for run in self.store.list_runs())

    def _raise_if_canceled(self, run_id: str) -> None:
        if self._stopping or run_id in self._cancel_requested:
            raise RunCanceledError("Run canceled by user.")

    def _has_active_policies_stage(self) -> bool:
        stage_runs = [
            run
            for run in self.store.list_runs()
            if run.stage == RunStage.policies and run.kind in {RunKind.apply, RunKind.destroy}
        ]
        if not stage_runs:
            return False

        latest = max(stage_runs, key=lambda run: run.created_at)
        return latest.kind == RunKind.apply and latest.status == RunStatus.applied

    def _require_cluster_admin_access(self) -> None:
        config = self.store.load_config()
        admin_arns = [arn.strip() for arn in config.cluster_admin_principal_arns if arn.strip()]
        if admin_arns:
            return

        raise HTTPException(
            status_code=409,
            detail=(
                "Add at least one cluster admin IAM principal ARN in Settings -> Admin Access before planning or "
                "applying. Without an admin ARN, Terraform can create AWS infrastructure but may not be able to "
                "manage or destroy the in-cluster Kubernetes and Helm resources safely."
            ),
        )

    def _is_core_bootstrap_auth_delay(self, run: TerraformRun, exc: CommandFailedError) -> bool:
        if run.stage != RunStage.core or run.kind != RunKind.apply:
            return False

        haystack = "\n".join(exc.recent_lines)
        auth_markers = [
            "Kubernetes cluster unreachable: the server has asked for the client to provide credentials",
            "Unauthorized",
        ]
        access_entry_markers = [
            "aws_eks_access_entry.cluster_admins",
            "aws_eks_access_policy_association.cluster_admins",
        ]
        return any(marker in haystack for marker in auth_markers) and any(marker in haystack for marker in access_entry_markers)


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


LOCK_INFO_FIELD_RE = re.compile(r"^\s*-?\s*(ID|Path|Operation|Who|Version|Created|Info):\s*(.*)$")


def explain_terraform_output(output: str) -> str | None:
    recent_output = strip_ansi(output).strip()
    if not recent_output:
        return None

    if "No valid credential sources found" in recent_output or "InvalidGrantException" in recent_output:
        return (
            "Terraform could not authenticate to AWS. "
            "Refresh the AWS credentials used by the backend process, then retry. "
            "If you use AWS SSO, run `aws sso login --profile <your-profile>` and start the backend with "
            "`AWS_PROFILE=<your-profile>`.\n\n"
            f"Recent Terraform output:\n{recent_output}"
        )

    if "Error acquiring the state lock" in recent_output:
        lock_fields: dict[str, str] = {}
        for line in recent_output.splitlines():
            match = LOCK_INFO_FIELD_RE.match(line)
            if match:
                lock_fields[match.group(1)] = match.group(2).strip()

        lock_id = lock_fields.get("ID")
        lock_path = lock_fields.get("Path")
        lock_who = lock_fields.get("Who")
        lock_created = lock_fields.get("Created")

        direct_delete_hint = None
        if lock_path and "/" in lock_path:
            bucket, key = lock_path.split("/", 1)
            direct_delete_hint = f"aws s3 rm s3://{bucket}/{key}.tflock"

        details = [f"- ID: {lock_id}" if lock_id else None, f"- Path: {lock_path}" if lock_path else None]
        if lock_who:
            details.append(f"- Who: {lock_who}")
        if lock_created:
            details.append(f"- Created: {lock_created}")

        owner_hint = ""
        if lock_who and lock_who.startswith("root@"):
            owner_hint = (
                "\n\nThis lock was created by the backend container, which usually means an earlier app run was "
                "interrupted before Terraform could release the lock."
            )

        unlock_hint = "terraform force-unlock <lock-id>"
        if lock_id:
            unlock_hint = f"terraform force-unlock {lock_id}"

        direct_delete_section = ""
        if direct_delete_hint:
            direct_delete_section = (
                "\n\nIf `force-unlock` does not clear it, remove the native S3 lock object directly:\n"
                f"`{direct_delete_hint}`"
            )

        detail_block = "\n".join(detail for detail in details if detail)

        return (
            "Terraform could not acquire the remote state lock. "
            "This usually means an earlier plan/apply/destroy was interrupted and left a stale S3 `.tflock` object.\n\n"
            "If you are sure no other run is still active, clear the stale lock from the same Terraform stage with:\n"
            f"`{unlock_hint}`"
            f"{direct_delete_section}"
            f"{owner_hint}"
            f"\n\nLock details:\n{detail_block}\n\n"
            f"Recent Terraform output:\n{recent_output}"
        )

    auth_markers = [
        "Kubernetes cluster unreachable: the server has asked for the client to provide credentials",
        "Unauthorized",
    ]
    access_entry_markers = [
        "aws_eks_access_entry.cluster_admins",
        "aws_eks_access_policy_association.cluster_admins",
    ]
    if any(marker in recent_output for marker in auth_markers) and any(marker in recent_output for marker in access_entry_markers):
        return (
            "Terraform reached the point where cluster admin access had been created, but Kubernetes and Helm access "
            "had not propagated yet. The apply stopped here to preserve the reviewed plan. Wait briefly for access "
            "propagation, then create a fresh plan and apply again.\n\n"
            f"Recent Terraform output:\n{recent_output}"
        )

    if "ResourceAlreadyExistsException" in recent_output and "CloudWatch Logs Log Group" in recent_output:
        return (
            "Terraform found an AWS CloudWatch log group that already exists from an earlier partial apply, "
            "but that resource is not in Terraform state. "
            "For this EKS cluster, the usual fix is to either import `/aws/eks/<cluster-name>/cluster` into the "
            "current Terraform state or delete the orphaned log group in AWS and rerun the apply.\n\n"
            f"Recent Terraform output:\n{recent_output}"
        )

    return None


def extract_lock_info(output: str) -> StateLockInfo | None:
    cleaned_output = strip_ansi(output).strip()
    if "Error acquiring the state lock" not in cleaned_output:
        return None

    lock_fields: dict[str, str] = {}
    for line in cleaned_output.splitlines():
        match = LOCK_INFO_FIELD_RE.match(line)
        if match:
            lock_fields[match.group(1)] = match.group(2).strip()

    lock_id = lock_fields.get("ID")
    if not lock_id:
        return None

    return StateLockInfo(
        id=lock_id,
        path=lock_fields.get("Path"),
        operation=lock_fields.get("Operation"),
        who=lock_fields.get("Who"),
        version=lock_fields.get("Version"),
        created=lock_fields.get("Created"),
        info=lock_fields.get("Info"),
    )


def build_command_error_message(command: list[str], exit_code: int, recent_lines: list[str]) -> str:
    recent_output = "\n".join(strip_ansi(line) for line in recent_lines if line.strip())

    explained = explain_terraform_output(recent_output)
    if explained:
        return explained

    if recent_output:
        return (
            f"{' '.join(command)} failed with exit code {exit_code}.\n\n"
            f"Recent Terraform output:\n{recent_output}"
        )

    return f"{' '.join(command)} failed with exit code {exit_code}"


def canceled_run_message(kind: RunKind) -> str:
    if kind in {RunKind.apply, RunKind.destroy}:
        return "Run canceled by user. Terraform may have already changed remote infrastructure or state. Create a fresh plan before continuing."
    return "Run canceled by user."


def interrupted_run_message(kind: RunKind) -> str:
    if kind in {RunKind.apply, RunKind.destroy}:
        return "Run was interrupted by a backend restart or worker stop. Terraform may have partially changed remote infrastructure or state. Create a fresh plan before continuing."
    return "Run was interrupted by a backend restart or worker stop."
