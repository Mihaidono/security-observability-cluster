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


def default_kyverno_cluster_policies() -> list[dict[str, Any]]:
    return [
        {
            "id": "require-ward-subject-label",
            "name": "Require ward subject label",
            "description": "Require pods deployed into ward namespaces to carry the isolens.io/subject label.",
            "enabled": True,
            "manifest": {
                "apiVersion": "kyverno.io/v1",
                "kind": "ClusterPolicy",
                "metadata": {"name": "require-ward-subject-label"},
                "spec": {
                    "background": True,
                    "rules": [
                        {
                            "name": "pods-in-wards-must-carry-subject-label",
                            "match": {
                                "any": [
                                    {
                                        "resources": {
                                            "kinds": ["Pod"],
                                            "namespaceSelector": {
                                                "matchExpressions": [
                                                    {
                                                        "key": "analysis-tier",
                                                        "operator": "Exists",
                                                    }
                                                ]
                                            },
                                        }
                                    }
                                ]
                            },
                            "validate": {
                                "failureAction": "Enforce",
                                "message": "Pods deployed into ward namespaces must declare the isolens.io/subject label.",
                                "pattern": {
                                    "metadata": {
                                        "labels": {
                                            "isolens.io/subject": "?*",
                                        }
                                    }
                                },
                            },
                        }
                    ],
                },
            },
        },
        {
            "id": "disallow-latest-tag-in-wards",
            "name": "Disallow latest image tags",
            "description": "Deny ward workloads that use mutable latest tags.",
            "enabled": True,
            "manifest": {
                "apiVersion": "kyverno.io/v1",
                "kind": "ClusterPolicy",
                "metadata": {"name": "disallow-latest-tag-in-wards"},
                "spec": {
                    "background": True,
                    "rules": [
                        {
                            "name": "disallow-latest-image-tags",
                            "match": {
                                "any": [
                                    {
                                        "resources": {
                                            "kinds": ["Pod"],
                                            "namespaceSelector": {
                                                "matchExpressions": [
                                                    {
                                                        "key": "analysis-tier",
                                                        "operator": "Exists",
                                                    }
                                                ]
                                            },
                                        }
                                    }
                                ]
                            },
                            "validate": {
                                "failureAction": "Enforce",
                                "message": "Ward workloads must pin container images and may not use the latest tag.",
                                "foreach": [
                                    {
                                        "list": "request.object.spec.containers",
                                        "deny": {
                                            "conditions": {
                                                "any": [
                                                    {
                                                        "key": "{{ contains(element.image, ':latest') }}",
                                                        "operator": "Equals",
                                                        "value": True,
                                                    }
                                                ]
                                            }
                                        },
                                    }
                                ],
                            },
                        }
                    ],
                },
            },
        },
    ]


def default_tetragon_tracing_policies() -> list[dict[str, Any]]:
    return [
        {
            "id": "suspicious-exec",
            "name": "Suspicious exec tracing",
            "description": "Trace suspicious network and shell executions in every ward namespace.",
            "enabled": True,
            "scope": "all-wards",
            "manifest": {
                "apiVersion": "cilium.io/v1alpha1",
                "kind": "TracingPolicyNamespaced",
                "metadata": {"name": "suspicious-exec"},
                "spec": {
                    "kprobes": [
                        {
                            "call": "sys_execve",
                            "syscall": True,
                            "selectors": [
                                {
                                    "matchBinaries": [
                                        {
                                            "operator": "In",
                                            "values": [
                                                "/usr/bin/curl",
                                                "/usr/bin/wget",
                                                "/bin/wget",
                                                "/bin/curl",
                                                "/usr/bin/nc",
                                                "/bin/nc",
                                            ],
                                        }
                                    ],
                                    "matchActions": [{"action": "Post"}],
                                },
                                {
                                    "matchBinaries": [
                                        {
                                            "operator": "In",
                                            "values": [
                                                "/bin/sh",
                                                "/bin/bash",
                                                "/usr/bin/bash",
                                                "/usr/bin/sh",
                                            ],
                                        }
                                    ],
                                    "matchActions": [{"action": "Post"}],
                                },
                            ],
                        }
                    ]
                },
            },
        }
    ]


class PoliciesConfig(BaseModel):
    kyverno_cluster_policies: list[dict[str, Any]] = Field(default_factory=default_kyverno_cluster_policies)
    tetragon_tracing_policies: list[dict[str, Any]] = Field(default_factory=default_tetragon_tracing_policies)


class ApplicationsConfig(BaseModel):
    ward_applications: list[dict[str, Any]] = Field(default_factory=list)


class RunStage(str, Enum):
    core = "core"
    platform = "platform"
    policies = "policies"
    applications = "applications"


APP_CONTROL_PLANE_RUN_STAGES = [RunStage.policies, RunStage.applications]


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
    stages: list[RunStage] = Field(default_factory=lambda: APP_CONTROL_PLANE_RUN_STAGES.copy())
    cluster_status: str = "unknown"
    cluster_message: str = ""
    cluster_context: str | None = None
    cluster_nodes_ready: int | None = None
    cluster_nodes_total: int | None = None


class TerraformConfig(BaseModel):
    core: CoreConfig
    platform: PlatformConfig
    policies: PoliciesConfig
    applications: ApplicationsConfig

    @model_validator(mode="before")
    @classmethod
    def _migrate_flattened_shape(cls, value: Any) -> Any:
        if not isinstance(value, dict):
            return value

        if "core" in value:
            if "policies" not in value:
                next_value = dict(value)
                next_value["policies"] = {
                    "kyverno_cluster_policies": default_kyverno_cluster_policies(),
                    "tetragon_tracing_policies": default_tetragon_tracing_policies(),
                }
                return next_value
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
            "policies": value.get(
                "policies",
                {
                    "kyverno_cluster_policies": default_kyverno_cluster_policies(),
                    "tetragon_tracing_policies": default_tetragon_tracing_policies(),
                },
            ),
            "applications": {
                "ward_applications": value.get("ward_applications", []),
            },
        }
