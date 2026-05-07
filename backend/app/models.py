from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class TerraformConfig(BaseModel):
    project_name: str
    environment: str
    cluster_name: str
    kubernetes_version: str
    cluster_log_retention_in_days: int = 90
    cluster_admin_principal_arns: list[str] = Field(default_factory=list)
    analysis_subjects: dict[str, dict[str, Any]] = Field(default_factory=dict)
    ward_applications: list[dict[str, Any]] = Field(default_factory=list)


class RunStage(str, Enum):
    core = "core"
    policies = "policies"


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


class OutputsResponse(BaseModel):
    outputs: dict[str, Any]


class ObservabilityLinksResponse(BaseModel):
    hubble_ui_url: str | None = None
    hubble_available: bool = False


class HealthResponse(BaseModel):
    status: str
    active_run_id: str | None = None
    worker_running: bool = True
    managed_tfvars_present: bool
    queue_depth: int = 0
    auth_enabled: bool = True
    stages: list[RunStage] = Field(default_factory=lambda: [RunStage.core, RunStage.policies])
