from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True)
class Settings:
    project_root: Path
    infrastructure_root: Path
    terraform_core_root: Path
    terraform_policies_root: Path
    state_dir: Path
    runs_dir: Path
    database_path: Path
    managed_tfvars_path: Path
    default_config_path: Path
    terraform_bin: str
    cors_origins: list[str]
    api_token: str


def get_settings() -> Settings:
    project_root = Path(__file__).resolve().parents[2]
    backend_root = project_root / "backend"
    load_dotenv(backend_root / ".env")
    infrastructure_root = project_root / "infrastructure"
    terraform_core_root = infrastructure_root / "core"
    terraform_policies_root = infrastructure_root / "policies"
    state_dir = backend_root / "state"
    runs_dir = state_dir / "runs"
    state_dir.mkdir(parents=True, exist_ok=True)
    database_path = state_dir / "isolens.db"
    managed_tfvars_path = infrastructure_root / "frontend-managed.auto.tfvars.json"
    default_config_path = backend_root / "app" / "default_managed_config.json"

    cors_origins = [
        origin.strip()
        for origin in os.getenv("ISOLENS_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
        if origin.strip()
    ]

    return Settings(
        project_root=project_root,
        infrastructure_root=infrastructure_root,
        terraform_core_root=terraform_core_root,
        terraform_policies_root=terraform_policies_root,
        state_dir=state_dir,
        runs_dir=runs_dir,
        database_path=database_path,
        managed_tfvars_path=managed_tfvars_path,
        default_config_path=default_config_path,
        terraform_bin=os.getenv("TERRAFORM_BIN", "terraform"),
        cors_origins=cors_origins,
        api_token=os.getenv("ISOLENS_API_TOKEN", "dev-token"),
    )
