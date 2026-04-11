from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    repo_root: Path
    state_dir: Path
    runs_dir: Path
    managed_tfvars_path: Path
    default_config_path: Path
    terraform_bin: str
    cors_origins: list[str]


def get_settings() -> Settings:
    repo_root = Path(__file__).resolve().parents[2]
    state_dir = repo_root / "backend" / "state"
    runs_dir = state_dir / "runs"
    managed_tfvars_path = repo_root / "frontend-managed.auto.tfvars.json"
    default_config_path = repo_root / "backend" / "app" / "default_managed_config.json"

    cors_origins = [
        origin.strip()
        for origin in os.getenv("KUBEGUARDIAN_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
        if origin.strip()
    ]

    return Settings(
        repo_root=repo_root,
        state_dir=state_dir,
        runs_dir=runs_dir,
        managed_tfvars_path=managed_tfvars_path,
        default_config_path=default_config_path,
        terraform_bin=os.getenv("TERRAFORM_BIN", "terraform"),
        cors_origins=cors_origins,
    )
