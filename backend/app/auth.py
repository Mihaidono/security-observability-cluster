from __future__ import annotations

import secrets

from fastapi import Header, HTTPException, WebSocket

from .config import Settings


def require_api_token(
    settings: Settings,
    authorization: str | None = Header(default=None),
) -> None:
    expected = f"Bearer {settings.api_token}"
    if authorization and secrets.compare_digest(authorization, expected):
        return
    raise HTTPException(status_code=401, detail="Unauthorized")


async def require_websocket_token(
    websocket: WebSocket,
    settings: Settings,
    token: str | None,
) -> None:
    if token and secrets.compare_digest(token, settings.api_token):
        return
    await websocket.close(code=4401, reason="Unauthorized")
    raise HTTPException(status_code=401, detail="Unauthorized")
