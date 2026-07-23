from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone

from fastapi import HTTPException, Request, WebSocket

from .config import Settings
from .models import AuthenticatedUser
from .store import PostgresStore


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def generate_session_token() -> str:
    return secrets.token_urlsafe(48)


def hash_session_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _session_cookie_value(settings: Settings, request: Request | WebSocket) -> str | None:
    return request.cookies.get(settings.session_cookie_name)


def _unauthorized(detail: str = "Unauthorized") -> HTTPException:
    return HTTPException(status_code=401, detail=detail)


def require_session_user(
    *,
    request: Request,
    settings: Settings,
    store: PostgresStore,
) -> AuthenticatedUser:
    session_token = _session_cookie_value(settings, request)
    if not session_token:
        raise _unauthorized()

    session = store.load_active_session(hash_session_token(session_token))
    if session is None:
        raise _unauthorized()

    user = AuthenticatedUser(
        id=str(session["user_id"]),
        subject=str(session["subject"]),
        username=str(session["username"]),
        email=session["email"],
        display_name=session["display_name"],
        roles=list(session["roles"] or []),
    )
    request.state.session = session
    request.state.user = user
    store.touch_session(str(session["id"]), utc_now())
    return user


async def require_websocket_session(
    *,
    websocket: WebSocket,
    settings: Settings,
    store: PostgresStore,
) -> AuthenticatedUser:
    session_token = _session_cookie_value(settings, websocket)
    if not session_token:
        await websocket.close(code=4401, reason="Unauthorized")
        raise _unauthorized()

    session = store.load_active_session(hash_session_token(session_token))
    if session is None:
        await websocket.close(code=4401, reason="Unauthorized")
        raise _unauthorized()

    user = AuthenticatedUser(
        id=str(session["user_id"]),
        subject=str(session["subject"]),
        username=str(session["username"]),
        email=session["email"],
        display_name=session["display_name"],
        roles=list(session["roles"] or []),
    )
    websocket.state.session = session
    websocket.state.user = user
    store.touch_session(str(session["id"]), utc_now())
    return user
