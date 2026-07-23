from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api.auth_routes import router as auth_router
from .api.config_routes import router as config_router
from .api.health_routes import router as health_router
from .api.run_routes import router as run_router
from .api.dependencies import settings, store
from .middleware.audit import register_audit_middleware


app = FastAPI(
    title="Isolens Control Plane",
    version="0.1.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
register_audit_middleware(app, store)

app.include_router(auth_router)
app.include_router(health_router)
app.include_router(config_router)
app.include_router(run_router)
