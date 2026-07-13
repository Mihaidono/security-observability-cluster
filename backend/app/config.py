from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from .models import RunStage


@dataclass(frozen=True)
class Settings:
    project_root: Path
    infrastructure_root: Path
    terraform_stages_root: Path
    terraform_core_root: Path
    terraform_platform_root: Path
    terraform_policies_root: Path
    terraform_applications_root: Path
    state_dir: Path
    runs_dir: Path
    database_url: str
    managed_config_path: Path
    core_tfvars_path: Path
    platform_tfvars_path: Path
    policies_tfvars_path: Path
    applications_tfvars_path: Path
    default_config_path: Path
    terraform_bin: str
    cors_origins: list[str]
    api_token: str
    worker_poll_interval_seconds: float
    worker_heartbeat_interval_seconds: float
    worker_heartbeat_ttl_seconds: int

    def tfvars_path_for_stage(self, stage: RunStage) -> Path:
        if stage == RunStage.core:
            return self.core_tfvars_path
        if stage == RunStage.platform:
            return self.platform_tfvars_path
        if stage == RunStage.policies:
            return self.policies_tfvars_path
        return self.applications_tfvars_path


def get_settings() -> Settings:
    project_root = Path(__file__).resolve().parents[2]
    backend_root = project_root / "backend"
    load_dotenv(backend_root / ".env")
    infrastructure_root = project_root / "infrastructure"
    terraform_stages_root = infrastructure_root / "stages"
    terraform_core_root = terraform_stages_root / "core"
    terraform_platform_root = terraform_stages_root / "platform"
    terraform_policies_root = terraform_stages_root / "policies"
    terraform_applications_root = terraform_stages_root / "applications"
    state_dir = backend_root / "state"
    runs_dir = state_dir / "runs"
    state_dir.mkdir(parents=True, exist_ok=True)
    managed_config_path = state_dir / "managed-config.json"
    core_tfvars_path = terraform_core_root / "managed.auto.tfvars.json"
    platform_tfvars_path = terraform_platform_root / "managed.auto.tfvars.json"
    policies_tfvars_path = terraform_policies_root / "managed.auto.tfvars.json"
    applications_tfvars_path = terraform_applications_root / "managed.auto.tfvars.json"
    default_config_path = backend_root / "app" / "default_managed_config.json"

    cors_origins = [
        origin.strip()
        for origin in os.getenv("ISOLENS_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
        if origin.strip()
    ]

    return Settings(
        project_root=project_root,
        infrastructure_root=infrastructure_root,
        terraform_stages_root=terraform_stages_root,
        terraform_core_root=terraform_core_root,
        terraform_platform_root=terraform_platform_root,
        terraform_policies_root=terraform_policies_root,
        terraform_applications_root=terraform_applications_root,
        state_dir=state_dir,
        runs_dir=runs_dir,
        database_url=os.getenv(
            "ISOLENS_DATABASE_URL",
            "postgresql://isolens:isolens-dev-password-change-me@localhost:5432/isolens",
        ),
        managed_config_path=managed_config_path,
        core_tfvars_path=core_tfvars_path,
        platform_tfvars_path=platform_tfvars_path,
        policies_tfvars_path=policies_tfvars_path,
        applications_tfvars_path=applications_tfvars_path,
        default_config_path=default_config_path,
        terraform_bin=os.getenv("TERRAFORM_BIN", "terraform"),
        cors_origins=cors_origins,
        api_token=os.getenv("ISOLENS_API_TOKEN", "dev-token"),
        worker_poll_interval_seconds=float(os.getenv("ISOLENS_WORKER_POLL_INTERVAL_SECONDS", "2")),
        worker_heartbeat_interval_seconds=float(os.getenv("ISOLENS_WORKER_HEARTBEAT_INTERVAL_SECONDS", "5")),
        worker_heartbeat_ttl_seconds=int(os.getenv("ISOLENS_WORKER_HEARTBEAT_TTL_SECONDS", "20")),
    )
