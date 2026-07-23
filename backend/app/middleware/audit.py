from __future__ import annotations

from fastapi import FastAPI, Request, Response

from ..store import PostgresStore


def register_audit_middleware(app: FastAPI, store: PostgresStore) -> None:
    @app.middleware("http")
    async def audit_requests(request: Request, call_next) -> Response:
        response = await call_next(request)

        if request.url.path.startswith("/api/"):
            user = getattr(request.state, "user", None)
            session = getattr(request.state, "session", None)
            try:
                store.record_audit_event(
                    user_id=(user.id if user is not None else None),
                    session_id=(str(session["id"]) if session is not None else None),
                    method=request.method,
                    path=request.url.path,
                    status_code=response.status_code,
                    action=getattr(request.state, "audit_action", None),
                    resource_type=getattr(request.state, "audit_resource_type", None),
                    resource_id=getattr(request.state, "audit_resource_id", None),
                    details=getattr(request.state, "audit_details", None),
                )
            except Exception:
                pass

        return response
