from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, Request

from ..auth import require_session_user
from ..config import get_settings
from ..models import AuthenticatedUser, SessionResponse
from ..oidc import KeycloakOIDC
from ..run_service import RunService
from ..store import PostgresStore
from ..terraform_runner import TerraformRunner


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


settings = get_settings()
store = PostgresStore(settings)
oidc = KeycloakOIDC(settings)
run_service = RunService(settings, store)
unlock_runner = TerraformRunner(settings, store)


def authenticated_user_dependency(request: Request) -> AuthenticatedUser:
    return require_session_user(request=request, settings=settings, store=store)


def public_app_url(request: Request) -> str:
    origin = request.headers.get("origin")
    if origin:
        return origin.rstrip("/")

    forwarded_proto = request.headers.get("x-forwarded-proto")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    if host:
        scheme = forwarded_proto or request.url.scheme
        return f"{scheme}://{host}".rstrip("/")

    return settings.public_app_url.rstrip("/")


def public_realm_url(request: Request) -> str:
    return f"{public_app_url(request)}/auth/realms/{settings.oidc_realm}"


def authorization_endpoint(request: Request) -> str:
    return f"{public_realm_url(request)}/protocol/openid-connect/auth"


def logout_endpoint(request: Request) -> str:
    return f"{public_realm_url(request)}/protocol/openid-connect/logout"


def redirect_uri(request: Request) -> str:
    return f"{public_app_url(request)}/auth/callback"


def session_response_from_request(request: Request) -> SessionResponse:
    try:
        user = require_session_user(request=request, settings=settings, store=store)
    except HTTPException:
        return SessionResponse(authenticated=False)
    return SessionResponse(authenticated=True, user=user)


def set_audit_context(
    request: Request,
    *,
    action: str,
    resource_type: str | None = None,
    resource_id: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    request.state.audit_action = action
    request.state.audit_resource_type = resource_type
    request.state.audit_resource_id = resource_id
    request.state.audit_details = details or {}


def session_cookie_max_age(expires_at: datetime) -> int:
    remaining = int((expires_at - utc_now()).total_seconds())
    return max(0, remaining)
