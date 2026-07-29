from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .models import RunStage


@dataclass(frozen=True)
class BackendPaths:
    project_root: Path
    terraform_variable_set: str

    @classmethod
    def from_project_root(cls, project_root: Path, terraform_variable_set: str) -> "BackendPaths":
        return cls(
            project_root=project_root,
            terraform_variable_set=terraform_variable_set,
        )

    @property
    def backend_root(self) -> Path:
        return self.project_root / "backend"

    @property
    def infrastructure_root(self) -> Path:
        return self.project_root / "infrastructure"

    @property
    def terraform_stages_root(self) -> Path:
        return self.infrastructure_root / "stages"

    @property
    def terraform_variables_root(self) -> Path:
        return self.infrastructure_root / "variables"

    @property
    def terraform_variable_set_root(self) -> Path:
        return self.terraform_variables_root / self.terraform_variable_set

    @property
    def state_dir(self) -> Path:
        return self.backend_root / "state"

    @property
    def runs_dir(self) -> Path:
        return self.state_dir / "runs"

    @property
    def generated_tfvars_root(self) -> Path:
        return self.state_dir / "tfvars"

    @property
    def managed_config_path(self) -> Path:
        return self.state_dir / "managed-config.json"

    @property
    def default_config_path(self) -> Path:
        return self.backend_root / "app" / "default_managed_config.json"

    @property
    def helm_root(self) -> Path:
        return self.state_dir / "helm"

    def ensure_runtime_dirs(self) -> None:
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.generated_tfvars_root.mkdir(parents=True, exist_ok=True)

    def terraform_stage_root(self, stage: RunStage) -> Path:
        return self.terraform_stages_root / stage.value

    def committed_tfvars_path(self, stage: RunStage) -> Path:
        return self.terraform_variable_set_root / f"{stage.value}.tfvars.json"

    def generated_tfvars_path(self, stage: RunStage) -> Path:
        return self.generated_tfvars_root / f"{stage.value}.tfvars.json"

    def all_generated_tfvars_paths(self) -> list[Path]:
        return [self.generated_tfvars_path(stage) for stage in RunStage]

    def all_committed_tfvars_paths(self) -> list[Path]:
        return [self.committed_tfvars_path(stage) for stage in RunStage]

    def managed_artifacts(self) -> list[Path]:
        return [self.managed_config_path, *self.all_generated_tfvars_paths(), *self.all_committed_tfvars_paths()]

    def run_dir(self, run_id: str) -> Path:
        return self.runs_dir / run_id

    def var_file_args(self, stage: RunStage) -> list[str]:
        args: list[str] = []
        for path in [self.committed_tfvars_path(stage), self.generated_tfvars_path(stage)]:
            args.extend(["-var-file", str(path)])
        return args
