from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field
from pydantic import model_validator


class CoreConfig(BaseModel):
    project_name: str
    environment: str
    cluster_name: str
    kubernetes_version: str
    cluster_log_retention_in_days: int = 90
    cluster_admin_principal_arns: list[str] = Field(default_factory=list)


class PlatformConfig(BaseModel):
    analysis_subjects: dict[str, dict[str, Any]] = Field(default_factory=dict)


class ApplicationsConfig(BaseModel):
    ward_applications: list[dict[str, Any]] = Field(default_factory=list)


class RunStage(str, Enum):
    core = "core"
    platform = "platform"
    applications = "applications"


class RunKind(str, Enum):
    plan = "plan"
    apply = "apply"
    destroy = "destroy"


class RunStatus(str, Enum):
    queued = "queued"
    running = "running"
    planned = "planned"
    applying = "applying"
    applied = "applied"
    destroying = "destroying"
    destroyed = "destroyed"
    canceling = "canceling"
    canceled = "canceled"
    failed = "failed"


class PlanSummary(BaseModel):
    create: int = 0
    update: int = 0
    delete: int = 0
    replace: int = 0
    addresses: list[str] = Field(default_factory=list)


class TerraformRun(BaseModel):
    id: str
    stage: RunStage
    kind: RunKind
    status: RunStatus
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    command: list[str] = Field(default_factory=list)
    plan_path: str | None = None
    log_path: str | None = None
    error: str | None = None
    plan_summary: PlanSummary | None = None
    outputs: dict[str, Any] | None = None
    source_run_id: str | None = None
    queue_position: int | None = None


class RunListResponse(BaseModel):
    items: list[TerraformRun]


class RunLogsResponse(BaseModel):
    run_id: str
    logs: list[str]


class RunPruneResponse(BaseModel):
    items: list[TerraformRun]
    deleted_count: int
    kept_count: int


class OutputsResponse(BaseModel):
    outputs: dict[str, Any]


class StateLockInfo(BaseModel):
    id: str
    path: str | None = None
    operation: str | None = None
    who: str | None = None
    version: str | None = None
    created: str | None = None
    info: str | None = None


class UnlockStateResponse(BaseModel):
    stage: RunStage
    unlocked: bool = True
    detail: str
    lock: StateLockInfo
    source_run_id: str | None = None


class HealthResponse(BaseModel):
    status: str
    active_run_id: str | None = None
    worker_running: bool = True
    managed_tfvars_present: bool
    queue_depth: int = 0
    auth_enabled: bool = True
    stages: list[RunStage] = Field(default_factory=lambda: [RunStage.core, RunStage.platform, RunStage.applications])


class TerraformConfig(BaseModel):
    core: CoreConfig
    platform: PlatformConfig
    applications: ApplicationsConfig

    @model_validator(mode="before")
    @classmethod
    def _migrate_flattened_shape(cls, value: Any) -> Any:
        if not isinstance(value, dict) or "core" in value:
            return value

        return {
            "core": {
                "project_name": value.get("project_name", "isolens"),
                "environment": value.get("environment", "lab"),
                "cluster_name": value.get("cluster_name", "forensic-lab"),
                "kubernetes_version": value.get("kubernetes_version", "1.35"),
                "cluster_log_retention_in_days": value.get("cluster_log_retention_in_days", 90),
                "cluster_admin_principal_arns": value.get("cluster_admin_principal_arns", []),
            },
            "platform": {
                "analysis_subjects": value.get("analysis_subjects", {}),
            },
            "applications": {
                "ward_applications": value.get("ward_applications", []),
            },
        }
