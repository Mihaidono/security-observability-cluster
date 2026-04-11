from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .config import Settings
from .models import TerraformConfig, TerraformRun


class FileStore:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.settings.state_dir.mkdir(parents=True, exist_ok=True)
        self.settings.runs_dir.mkdir(parents=True, exist_ok=True)

    def load_default_config(self) -> TerraformConfig:
        return TerraformConfig.model_validate_json(self.settings.default_config_path.read_text())

    def load_config(self) -> TerraformConfig:
        path = self.settings.managed_tfvars_path
        if not path.exists():
            default_config = self.load_default_config()
            self.save_config(default_config)
            return default_config
        return TerraformConfig.model_validate_json(path.read_text())

    def save_config(self, config: TerraformConfig) -> None:
        payload = json.dumps(config.model_dump(mode="json"), indent=2)
        self.settings.managed_tfvars_path.write_text(f"{payload}\n")

    def reset_config(self) -> TerraformConfig:
        config = self.load_default_config()
        self.save_config(config)
        return config

    def run_dir(self, run_id: str) -> Path:
        path = self.settings.runs_dir / run_id
        path.mkdir(parents=True, exist_ok=True)
        return path

    def save_run(self, run: TerraformRun) -> None:
        run_dir = self.run_dir(run.id)
        (run_dir / "run.json").write_text(run.model_dump_json(indent=2))

    def load_run(self, run_id: str) -> TerraformRun | None:
        path = self.settings.runs_dir / run_id / "run.json"
        if not path.exists():
            return None
        return TerraformRun.model_validate_json(path.read_text())

    def list_runs(self) -> list[TerraformRun]:
        items: list[TerraformRun] = []
        for path in sorted(self.settings.runs_dir.glob("*/run.json"), reverse=True):
            items.append(TerraformRun.model_validate_json(path.read_text()))
        items.sort(key=lambda item: item.created_at, reverse=True)
        return items

    def append_logs(self, run_id: str, lines: list[str]) -> None:
        if not lines:
            return
        log_path = self.run_dir(run_id) / "run.log"
        with log_path.open("a", encoding="utf-8") as handle:
            for line in lines:
                handle.write(f"{line}\n")

    def read_logs(self, run_id: str) -> list[str]:
        log_path = self.settings.runs_dir / run_id / "run.log"
        if not log_path.exists():
            return []
        return log_path.read_text(encoding="utf-8").splitlines()

    def save_json_artifact(self, run_id: str, name: str, payload: dict[str, Any]) -> Path:
        path = self.run_dir(run_id) / name
        path.write_text(json.dumps(payload, indent=2))
        return path
