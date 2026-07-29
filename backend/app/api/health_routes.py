from __future__ import annotations

from fastapi import APIRouter, Depends

from ..models import APP_CONTROL_PLANE_RUN_STAGES, HealthResponse
from .dependencies import authenticated_user_dependency, run_service, settings


router = APIRouter(tags=["health"])


@router.get(
    "/api/health",
    response_model=HealthResponse,
    dependencies=[Depends(authenticated_user_dependency)],
)
async def health() -> HealthResponse:
    run_service.reconcile_stale_workers()
    worker_running, active_run_id = run_service.worker_snapshot()
    cluster_status = "healthy" if worker_running else "degraded"
    cluster_message = (
        "Backend API is reachable and the worker is running."
        if worker_running
        else "Backend API is reachable, but the worker is not running."
    )
    return HealthResponse(
        status="ok" if worker_running else "degraded",
        active_run_id=active_run_id,
        worker_running=worker_running,
        managed_tfvars_present=all(path.exists() for path in settings.paths.managed_artifacts()),
        queue_depth=run_service.queue_depth(),
        auth_enabled=True,
        stages=APP_CONTROL_PLANE_RUN_STAGES,
        cluster_status=cluster_status,
        cluster_message=cluster_message,
        cluster_context=None,
        cluster_nodes_ready=None,
        cluster_nodes_total=None,
    )
