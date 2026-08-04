from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

from .models import RunStage
from .paths import BackendPaths


@dataclass(frozen=True)
class Settings:
    paths: BackendPaths
    terraform_variable_set: str
    database_url: str
    terraform_bin: str
    cors_origins: list[str]
    public_app_url: str
    oidc_internal_base_url: str
    oidc_realm: str
    oidc_client_id: str
    oidc_client_secret: str
    session_cookie_name: str
    session_cookie_secure: bool
    session_ttl_seconds: int
    worker_poll_interval_seconds: float
    worker_heartbeat_interval_seconds: float
    worker_heartbeat_ttl_seconds: int

    @property
    def oidc_public_base_url(self) -> str:
        return f"{self.public_app_url.rstrip('/')}/auth"

    @property
    def oidc_public_realm_url(self) -> str:
        return f"{self.oidc_public_base_url}/realms/{self.oidc_realm}"

    @property
    def oidc_internal_realm_url(self) -> str:
        return f"{self.oidc_internal_base_url.rstrip('/')}/realms/{self.oidc_realm}"

    @property
    def oidc_authorization_endpoint(self) -> str:
        return f"{self.oidc_public_realm_url}/protocol/openid-connect/auth"

    @property
    def oidc_logout_endpoint(self) -> str:
        return f"{self.oidc_public_realm_url}/protocol/openid-connect/logout"

    @property
    def oidc_token_endpoint(self) -> str:
        return f"{self.oidc_internal_realm_url}/protocol/openid-connect/token"

    @property
    def oidc_jwks_endpoint(self) -> str:
        return f"{self.oidc_internal_realm_url}/protocol/openid-connect/certs"

    @property
    def oidc_redirect_uri(self) -> str:
        return f"{self.public_app_url.rstrip('/')}/login/callback"

    @property
    def oidc_post_logout_redirect_uri(self) -> str:
        return self.oidc_redirect_uri

    @property
    def project_root(self) -> Path:
        return self.paths.project_root

    @property
    def backend_root(self) -> Path:
        return self.paths.backend_root

    @property
    def infrastructure_root(self) -> Path:
        return self.paths.infrastructure_root

    @property
    def terraform_stages_root(self) -> Path:
        return self.paths.terraform_stages_root

    @property
    def terraform_variables_root(self) -> Path:
        return self.paths.terraform_variables_root

    @property
    def terraform_core_root(self) -> Path:
        return self.paths.terraform_stage_root(RunStage.core)

    @property
    def terraform_platform_root(self) -> Path:
        return self.paths.terraform_stage_root(RunStage.platform)

    @property
    def terraform_policies_root(self) -> Path:
        return self.paths.terraform_stage_root(RunStage.policies)

    @property
    def terraform_applications_root(self) -> Path:
        return self.paths.terraform_stage_root(RunStage.applications)

    @property
    def state_dir(self) -> Path:
        return self.paths.state_dir

    @property
    def runs_dir(self) -> Path:
        return self.paths.runs_dir

    @property
    def generated_tfvars_root(self) -> Path:
        return self.paths.generated_tfvars_root

    @property
    def managed_config_path(self) -> Path:
        return self.paths.managed_config_path

    @property
    def core_tfvars_path(self) -> Path:
        return self.paths.generated_tfvars_path(RunStage.core)

    @property
    def platform_tfvars_path(self) -> Path:
        return self.paths.generated_tfvars_path(RunStage.platform)

    @property
    def policies_tfvars_path(self) -> Path:
        return self.paths.generated_tfvars_path(RunStage.policies)

    @property
    def applications_tfvars_path(self) -> Path:
        return self.paths.generated_tfvars_path(RunStage.applications)

    @property
    def default_config_path(self) -> Path:
        return self.paths.default_config_path

    def tfvars_path_for_stage(self, stage: RunStage) -> Path:
        return self.paths.generated_tfvars_path(stage)

    def committed_tfvars_path_for_stage(self, stage: RunStage) -> Path:
        return self.paths.committed_tfvars_path(stage)

    def terraform_root_for_stage(self, stage: RunStage) -> Path:
        return self.paths.terraform_stage_root(stage)

    def var_file_args_for_stage(self, stage: RunStage) -> list[str]:
        return self.paths.var_file_args(stage)


def get_settings() -> Settings:
    project_root = Path(__file__).resolve().parents[2]
    backend_root = project_root / "backend"
    load_dotenv(backend_root / ".env")
    terraform_variable_set = os.getenv("ISOLENS_TERRAFORM_VARIABLE_SET", "lab").strip() or "lab"
    paths = BackendPaths.from_project_root(project_root, terraform_variable_set)
    paths.ensure_runtime_dirs()

    cors_origins = [
        origin.strip()
        for origin in os.getenv("ISOLENS_CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
        if origin.strip()
    ]

    return Settings(
        paths=paths,
        terraform_variable_set=terraform_variable_set,
        database_url=os.getenv(
            "ISOLENS_DATABASE_URL",
            "postgresql://isolens:isolens-dev-password-change-me@localhost:5432/isolens",
        ),
        terraform_bin=os.getenv("TERRAFORM_BIN", "terraform"),
        cors_origins=cors_origins,
        public_app_url=os.getenv("ISOLENS_PUBLIC_APP_URL", "http://localhost:5173").rstrip("/"),
        oidc_internal_base_url=os.getenv("ISOLENS_OIDC_INTERNAL_BASE_URL", "http://keycloak:8080/auth").rstrip("/"),
        oidc_realm=os.getenv("ISOLENS_OIDC_REALM", "isolens"),
        oidc_client_id=os.getenv("ISOLENS_OIDC_CLIENT_ID", "isolens-web"),
        oidc_client_secret=os.getenv("ISOLENS_OIDC_CLIENT_SECRET", ""),
        session_cookie_name=os.getenv("ISOLENS_SESSION_COOKIE_NAME", "isolens_session"),
        session_cookie_secure=os.getenv("ISOLENS_SESSION_COOKIE_SECURE", "false").lower() == "true",
        session_ttl_seconds=int(os.getenv("ISOLENS_SESSION_TTL_SECONDS", "7200")),
        worker_poll_interval_seconds=float(os.getenv("ISOLENS_WORKER_POLL_INTERVAL_SECONDS", "2")),
        worker_heartbeat_interval_seconds=float(os.getenv("ISOLENS_WORKER_HEARTBEAT_INTERVAL_SECONDS", "5")),
        worker_heartbeat_ttl_seconds=int(os.getenv("ISOLENS_WORKER_HEARTBEAT_TTL_SECONDS", "20")),
    )
