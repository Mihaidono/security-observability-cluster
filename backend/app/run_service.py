from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException

from .config import Settings
from .models import RunKind, RunStage, RunStatus, TerraformRun
from .run_messages import canceled_run_message
from .store import PostgresStore


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class RunService:
    def __init__(self, settings: Settings, store: PostgresStore) -> None:
        self.settings = settings
        self.store = store

    def worker_snapshot(self) -> tuple[bool, str | None]:
        return self.store.worker_snapshot(self.settings.worker_heartbeat_ttl_seconds)

    def queue_depth(self) -> int:
        return self.store.queue_depth()

    def has_nonterminal_runs(self) -> bool:
        return self.store.has_nonterminal_runs()

    async def start_plan(self, stage: RunStage) -> TerraformRun:
        self._require_cluster_admin_access()

        dependency = self._plan_dependency_for_stage(stage)
        if dependency is not None and not self._stage_is_applied(dependency):
            raise HTTPException(status_code=409, detail=self._missing_apply_message(stage, dependency))

        run_id = uuid.uuid4().hex[:12]
        run_dir = self.store.run_dir(run_id)
        run = TerraformRun(
            id=run_id,
            stage=stage,
            kind=RunKind.plan,
            status=RunStatus.queued,
            created_at=utc_now(),
            updated_at=utc_now(),
            command=[
                self.settings.terraform_bin,
                "plan",
                "-input=false",
                "-no-color",
                "-out",
                str(run_dir / "planned.tfplan"),
                "-var-file",
                str(self.settings.tfvars_path_for_stage(stage)),
            ],
            plan_path=str(run_dir / "planned.tfplan"),
            log_path=str(run_dir / "run.log"),
        )
        return self.store.enqueue_run(run)

    async def start_apply(self, run_id: str) -> TerraformRun:
        self._require_cluster_admin_access()

        source_run = self.store.load_run(run_id)
        if source_run is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        if source_run.kind != RunKind.plan:
            raise HTTPException(status_code=409, detail="Only a plan run can be used as the source for apply.")
        if source_run.status not in {RunStatus.queued, RunStatus.running, RunStatus.planned}:
            raise HTTPException(
                status_code=409,
                detail="Apply can only be queued from a plan run that is queued, running, or planned.",
            )
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
            command=[self.settings.terraform_bin, "apply", "-input=false", "-json", source_run.plan_path],
            plan_path=source_run.plan_path,
            log_path=str(self.store.run_dir(apply_run_id) / "run.log"),
            source_run_id=source_run.id,
        )
        return self.store.enqueue_run(apply_run)

    async def start_destroy(self, stage: RunStage) -> TerraformRun:
        self._require_cluster_admin_access()

        for blocking_stage in self._destroy_blockers_for_stage(stage):
            if self._stage_is_applied(blocking_stage):
                raise HTTPException(status_code=409, detail=self._destroy_blocker_message(stage, blocking_stage))

        destroy_run_id = uuid.uuid4().hex[:12]
        run = TerraformRun(
            id=destroy_run_id,
            stage=stage,
            kind=RunKind.destroy,
            status=RunStatus.queued,
            created_at=utc_now(),
            updated_at=utc_now(),
            command=[
                self.settings.terraform_bin,
                "destroy",
                "-auto-approve",
                "-input=false",
                "-no-color",
                "-var-file",
                str(self.settings.tfvars_path_for_stage(stage)),
            ],
            log_path=str(self.store.run_dir(destroy_run_id) / "run.log"),
        )
        return self.store.enqueue_run(run)

    async def cancel_run(self, run_id: str) -> TerraformRun:
        run = self.store.load_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        if run.status == RunStatus.canceling:
            return run
        if run.status in {
            RunStatus.applied,
            RunStatus.destroyed,
            RunStatus.failed,
            RunStatus.canceled,
            RunStatus.planned,
        }:
            raise HTTPException(status_code=409, detail="This run is already finished.")

        now = utc_now()
        if run.status == RunStatus.queued and not self.store.is_run_claimed(run.id):
            run.status = RunStatus.canceled
            run.completed_at = now
            run.updated_at = now
            run.error = "Canceled before execution."
            run.queue_position = None
            self.store.save_run(run)
            self.store.refresh_queue_positions()
            reloaded = self.store.load_run(run.id)
            if reloaded is None:
                raise RuntimeError(f"Canceled run {run.id} could not be reloaded.")
            return reloaded

        self.store.request_run_cancellation(run.id)
        run.status = RunStatus.canceling
        run.updated_at = now
        run.error = "Cancellation requested."
        self.store.save_run(run)
        self.store.refresh_queue_positions()
        reloaded = self.store.load_run(run.id)
        if reloaded is None:
            raise RuntimeError(f"Canceling run {run.id} could not be reloaded.")
        return reloaded

    def reconcile_stale_workers(self) -> None:
        self.store.reconcile_stale_workers(self.settings.worker_heartbeat_ttl_seconds)

    def _has_apply_attempt_for_plan(self, plan_run_id: str) -> bool:
        return any(run.kind == RunKind.apply and run.source_run_id == plan_run_id for run in self.store.list_runs())

    def _stage_is_applied(self, stage: RunStage) -> bool:
        for run in self.store.list_runs():
            if run.stage != stage or run.kind not in {RunKind.apply, RunKind.destroy}:
                continue
            if run.kind == RunKind.destroy and run.status == RunStatus.destroyed:
                return False
            if run.kind == RunKind.apply and run.status == RunStatus.applied:
                return True
        return False

    def _plan_dependency_for_stage(self, stage: RunStage) -> RunStage | None:
        if stage == RunStage.platform:
            return RunStage.core
        if stage == RunStage.policies:
            return RunStage.platform
        if stage == RunStage.applications:
            return RunStage.policies
        return None

    def _destroy_blockers_for_stage(self, stage: RunStage) -> list[RunStage]:
        if stage == RunStage.core:
            return [RunStage.applications, RunStage.policies, RunStage.platform]
        if stage == RunStage.platform:
            return [RunStage.applications, RunStage.policies]
        if stage == RunStage.policies:
            return [RunStage.applications]
        return []

    def _require_cluster_admin_access(self) -> None:
        config = self.store.load_config()
        admin_arns = [arn.strip() for arn in config.core.cluster_admin_principal_arns if arn.strip()]
        if admin_arns:
            return

        raise HTTPException(
            status_code=409,
            detail=(
                "Add at least one cluster admin IAM principal ARN in Settings -> Admin Access before planning or "
                "applying. Without an admin ARN, core can create the cluster, but the later platform "
                "stages may not be able to manage or destroy in-cluster Kubernetes and Helm resources safely."
            ),
        )

    def _missing_apply_message(self, stage: RunStage, dependency: RunStage) -> str:
        return (
            f"Apply the {dependency.value} stage first. "
            f"The {stage.value} stage depends on the outputs and live resources owned by {dependency.value}."
        )

    def _destroy_blocker_message(self, stage: RunStage, blocking_stage: RunStage) -> str:
        return (
            f"Destroy the {blocking_stage.value} stage first. "
            f"The {blocking_stage.value} stage still owns resources that depend on {stage.value}."
        )
