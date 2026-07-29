from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, HTTPException, Request, Response

from ..auth import generate_session_token, hash_session_token
from ..models import AuthConfigResponse, AuthExchangeRequest, LogoutResponse, SessionResponse
from ..oidc import OIDCError
from .dependencies import (
    authorization_endpoint,
    oidc,
    public_realm_url,
    redirect_uri,
    session_cookie_max_age,
    session_response_from_request,
    set_audit_context,
    settings,
    store,
    utc_now,
    logout_endpoint,
)


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/config", response_model=AuthConfigResponse)
async def get_auth_config(request: Request) -> AuthConfigResponse:
    return AuthConfigResponse(
        authorization_endpoint=authorization_endpoint(request),
        client_id=settings.oidc_client_id,
        redirect_uri=redirect_uri(request),
        issuer=public_realm_url(request),
    )


@router.get("/session", response_model=SessionResponse)
async def get_auth_session(request: Request) -> SessionResponse:
    return session_response_from_request(request)


@router.post("/exchange", response_model=SessionResponse)
async def exchange_auth_code(
    payload: AuthExchangeRequest,
    request: Request,
    response: Response,
) -> SessionResponse:
    expected_redirect = redirect_uri(request)
    expected_issuer = public_realm_url(request)
    if payload.redirect_uri.rstrip("/") != expected_redirect.rstrip("/"):
        raise HTTPException(status_code=400, detail="Unexpected redirect URI.")

    try:
        token_payload = await oidc.exchange_code(
            code=payload.code,
            code_verifier=payload.code_verifier,
            redirect_uri=payload.redirect_uri,
        )
        user = oidc.validate_id_token(
            str(token_payload["id_token"]),
            expected_issuer=expected_issuer,
            audience=settings.oidc_client_id,
        )
    except OIDCError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=401, detail="Unable to validate the Keycloak identity token.") from exc

    now = utc_now()
    user_row = store.upsert_user(
        subject=user.subject,
        username=user.username,
        email=user.email,
        display_name=user.display_name,
        roles=user.roles,
        now=now,
    )

    session_token = generate_session_token()
    session_expires_at = min(
        datetime.fromtimestamp(oidc.expires_at_from_payload(token_payload), timezone.utc),
        now + timedelta(seconds=settings.session_ttl_seconds),
    )
    store.create_session(
        session_id=secrets.token_hex(16),
        user_id=str(user_row["id"]),
        subject=user.subject,
        token_hash=hash_session_token(session_token),
        id_token=str(token_payload["id_token"]),
        expires_at=session_expires_at,
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
        now=now,
    )

    response.set_cookie(
        key=settings.session_cookie_name,
        value=session_token,
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
        path="/",
        max_age=session_cookie_max_age(session_expires_at),
    )

    request.state.user = user
    set_audit_context(
        request,
        action="auth.login",
        resource_type="session",
        resource_id=user.subject,
        details={"username": user.username},
    )
    return SessionResponse(authenticated=True, user=user)


@router.post("/logout", response_model=LogoutResponse)
async def logout(request: Request, response: Response) -> LogoutResponse:
    session_response = session_response_from_request(request)
    session = getattr(request.state, "session", None)
    logout_url: str | None = None

    if session is not None:
        store.revoke_session(str(session["id"]), utc_now())
        query = {
            "post_logout_redirect_uri": settings.oidc_post_logout_redirect_uri,
            "client_id": settings.oidc_client_id,
        }
        if session.get("id_token"):
            query["id_token_hint"] = str(session["id_token"])
        logout_url = f"{logout_endpoint(request)}?{urlencode(query)}"

    response.delete_cookie(
        key=settings.session_cookie_name,
        path="/",
        httponly=True,
        secure=settings.session_cookie_secure,
        samesite="lax",
    )

    if session_response.user is not None:
        request.state.user = session_response.user
        set_audit_context(
            request,
            action="auth.logout",
            resource_type="session",
            resource_id=session_response.user.subject,
            details={"username": session_response.user.username},
        )

    return LogoutResponse(logged_out=True, logout_url=logout_url)
