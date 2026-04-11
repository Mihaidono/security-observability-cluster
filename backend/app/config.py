from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    project_root: Path
    terraform_root: Path
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
    terraform_root = project_root / "infrastructure"
    state_dir = project_root / "backend" / "state"
    runs_dir = state_dir / "runs"
    database_path = state_dir / "kubeguardian.db"
    managed_tfvars_path = terraform_root / "frontend-managed.auto.tfvars.json"
    default_config_path = project_root / "backend" / "app" / "default_managed_config.json"

    cors_origins = [
        origin.strip()
        for origin in os.getenv("KUBEGUARDIAN_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
        if origin.strip()
    ]

    return Settings(
        project_root=project_root,
        terraform_root=terraform_root,
        state_dir=state_dir,
        runs_dir=runs_dir,
        database_path=database_path,
        managed_tfvars_path=managed_tfvars_path,
        default_config_path=default_config_path,
        terraform_bin=os.getenv("TERRAFORM_BIN", "terraform"),
        cors_origins=cors_origins,
        api_token=os.getenv("KUBEGUARDIAN_API_TOKEN", "dev-token"),
    )
