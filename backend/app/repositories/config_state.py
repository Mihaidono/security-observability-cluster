from __future__ import annotations

import json

from ..models import TerraformConfig
from ..tfvars import (
    applications_tfvars_payload,
    core_tfvars_payload,
    platform_tfvars_payload,
    policies_tfvars_payload,
)
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
            legacy_path = self.settings.infrastructure_root / "frontend-managed.auto.tfvars.json"
            if legacy_path.exists():
                config = TerraformConfig.model_validate_json(legacy_path.read_text())
                self.save_config(config)
                return config
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
        self.settings.core_tfvars_path.write_text(f"{json.dumps(core_tfvars_payload(config), indent=2)}\n")
        self.settings.platform_tfvars_path.write_text(f"{json.dumps(platform_tfvars_payload(config), indent=2)}\n")
        self.settings.policies_tfvars_path.write_text(f"{json.dumps(policies_tfvars_payload(config), indent=2)}\n")
        self.settings.applications_tfvars_path.write_text(
            f"{json.dumps(applications_tfvars_payload(config), indent=2)}\n"
        )

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
        return all(
            stage_path.exists()
            for stage_path in [
                self.settings.core_tfvars_path,
                self.settings.platform_tfvars_path,
                self.settings.policies_tfvars_path,
                self.settings.applications_tfvars_path,
            ]
        )
