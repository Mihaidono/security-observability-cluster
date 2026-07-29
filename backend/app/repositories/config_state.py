from __future__ import annotations

import json

from ..models import TerraformConfig
from ..tfvars import generated_tfvars_payloads
from .base import BaseRepository, utc_now


class ConfigRepository(BaseRepository):
    def load_default_config(self) -> TerraformConfig:
        return TerraformConfig.model_validate_json(self.settings.default_config_path.read_text())

    def load_config(self) -> TerraformConfig:
        config_from_db = self._load_config_from_database()
        if config_from_db is not None:
            if not self._managed_tfvars_exist():
                self.save_config(config_from_db)
            return config_from_db

        path = self.settings.managed_config_path
        if not path.exists():
            default_config = self.load_default_config()
            self.save_config(default_config)
            return default_config
        config = TerraformConfig.model_validate_json(path.read_text())
        if not self._managed_tfvars_exist():
            self.save_config(config)
        return config

    def save_config(self, config: TerraformConfig) -> None:
        payload = json.dumps(config.model_dump(mode="json"), indent=2)
        with self._connection() as connection:
            connection.execute(
                """
        INSERT INTO config_state (key, payload_json, updated_at)
        VALUES (%s, %s, %s)
        ON CONFLICT(key) DO UPDATE SET
            payload_json = excluded.payload_json,
            updated_at = excluded.updated_at
        """,
                ("managed-config", payload, utc_now().isoformat()),
            )
        self.settings.managed_config_path.write_text(f"{payload}\n")
        for stage, stage_payload in generated_tfvars_payloads(config).items():
            self.settings.tfvars_path_for_stage(stage).write_text(f"{json.dumps(stage_payload, indent=2)}\n")

    def reset_config(self) -> TerraformConfig:
        config = self.load_default_config()
        self.save_config(config)
        return config

    def _load_config_from_database(self) -> TerraformConfig | None:
        with self._connection() as connection:
            row = connection.execute(
                "SELECT payload_json FROM config_state WHERE key = %s",
                ("managed-config",),
            ).fetchone()
        if row is None:
            return None
        return TerraformConfig.model_validate_json(row["payload_json"])

    def _managed_tfvars_exist(self) -> bool:
        return all(stage_path.exists() for stage_path in self.settings.paths.all_generated_tfvars_paths())
