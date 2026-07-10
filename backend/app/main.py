from __future__ import annotations

import asyncio

from fastapi import (
    Depends,
    FastAPI,
    Header,
    HTTPException,
    Query,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware

from .auth import require_api_token, require_websocket_token
from .config import Settings, get_settings
from .models import (
    HealthResponse,
    OutputsResponse,
    RunListResponse,
    RunLogsResponse,
    RunPruneResponse,
    RunStage,
    TerraformConfig,
    TerraformRun,
    UnlockStateResponse,
)
from .run_service import RunService
from .store import PostgresStore
from .terraform_runner import TerraformRunner


settings = get_settings()
store = PostgresStore(settings)
run_service = RunService(settings, store)
unlock_runner = TerraformRunner(settings, store)


def auth_dependency(
    authorization: str | None = Header(default=None),
) -> None:
    require_api_token(settings=settings, authorization=authorization)


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


@app.get(
    "/api/health",
    response_model=HealthResponse,
    dependencies=[Depends(auth_dependency)],
)
async def health() -> HealthResponse:
    run_service.reconcile_stale_workers()
    worker_running, active_run_id = run_service.worker_snapshot()
    return HealthResponse(
        status="ok" if worker_running else "degraded",
        active_run_id=active_run_id,
        worker_running=worker_running,
        managed_tfvars_present=all(
            path.exists()
            for path in [
                settings.managed_config_path,
                settings.core_tfvars_path,
                settings.platform_tfvars_path,
                settings.applications_tfvars_path,
            ]
        ),
        queue_depth=run_service.queue_depth(),
        auth_enabled=True,
        stages=[RunStage.core, RunStage.platform, RunStage.applications],
    )


@app.get(
    "/api/config",
    response_model=TerraformConfig,
    dependencies=[Depends(auth_dependency)],
)
async def get_config() -> TerraformConfig:
    return store.load_config()


@app.put(
    "/api/config",
    response_model=TerraformConfig,
    dependencies=[Depends(auth_dependency)],
)
async def save_config(config: TerraformConfig) -> TerraformConfig:
    store.save_config(config)
    return config


@app.post(
    "/api/config/reset",
    response_model=TerraformConfig,
    dependencies=[Depends(auth_dependency)],
)
async def reset_config() -> TerraformConfig:
    return store.reset_config()


@app.get("/api/runs", response_model=RunListResponse, dependencies=[Depends(auth_dependency)])
async def list_runs() -> RunListResponse:
    return RunListResponse(items=store.list_runs())


@app.get(
    "/api/runs/{run_id}",
    response_model=TerraformRun,
    dependencies=[Depends(auth_dependency)],
)
async def get_run(run_id: str) -> TerraformRun:
    run = store.load_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run


@app.get(
    "/api/runs/{run_id}/logs",
    response_model=RunLogsResponse,
    dependencies=[Depends(auth_dependency)],
)
async def get_run_logs(run_id: str) -> RunLogsResponse:
    run = store.load_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return RunLogsResponse(run_id=run_id, logs=store.read_logs(run_id))


@app.post(
    "/api/runs/prune",
    response_model=RunPruneResponse,
    dependencies=[Depends(auth_dependency)],
)
async def prune_runs(keep: int = Query(default=10, ge=0, le=200)) -> RunPruneResponse:
    if run_service.has_nonterminal_runs():
        raise HTTPException(
            status_code=409,
            detail="Cannot prune run history while another run is active or queued.",
        )

    items, deleted_count = store.prune_runs(keep)
    return RunPruneResponse(
        items=items,
        deleted_count=deleted_count,
        kept_count=len(items),
    )


@app.post(
    "/api/runs/plan/{stage}",
    response_model=TerraformRun,
    dependencies=[Depends(auth_dependency)],
)
async def start_plan(stage: RunStage) -> TerraformRun:
    return await run_service.start_plan(stage)


@app.post(
    "/api/runs/{run_id}/apply",
    response_model=TerraformRun,
    dependencies=[Depends(auth_dependency)],
)
async def start_apply(run_id: str) -> TerraformRun:
    return await run_service.start_apply(run_id)


@app.post(
    "/api/runs/destroy/{stage}",
    response_model=TerraformRun,
    dependencies=[Depends(auth_dependency)],
)
async def start_destroy(stage: RunStage) -> TerraformRun:
    return await run_service.start_destroy(stage)


@app.post(
    "/api/state/unlock/{stage}",
    response_model=UnlockStateResponse,
    dependencies=[Depends(auth_dependency)],
)
async def unlock_state(stage: RunStage) -> UnlockStateResponse:
    return await unlock_runner.unlock_state(stage)


@app.post(
    "/api/runs/{run_id}/cancel",
    response_model=TerraformRun,
    dependencies=[Depends(auth_dependency)],
)
async def cancel_run(run_id: str) -> TerraformRun:
    return await run_service.cancel_run(run_id)


@app.get(
    "/api/outputs",
    response_model=OutputsResponse,
    dependencies=[Depends(auth_dependency)],
)
async def get_outputs() -> OutputsResponse:
    outputs = store.latest_outputs()
    if outputs is None:
        raise HTTPException(status_code=404, detail="No outputs are available yet.")
    return OutputsResponse(outputs=outputs)


@app.websocket("/api/runs/{run_id}/events")
async def run_events(run_id: str, websocket: WebSocket) -> None:
    token = websocket.query_params.get("token")
    try:
        await require_websocket_token(websocket=websocket, settings=settings, token=token)
    except HTTPException:
        return

    run = store.load_run(run_id)
    if run is None:
        await websocket.close(code=4404, reason="Run not found")
        return

    await websocket.accept()
    logs = store.read_logs(run_id)
    await websocket.send_json(
        {
            "type": "run.snapshot",
            "run": run.model_dump(mode="json"),
            "logs": logs,
        }
    )

    last_updated_at = run.updated_at
    log_offset = len(logs)
    try:
        while True:
            await asyncio.sleep(1)
            latest_run = store.load_run(run_id)
            if latest_run is None:
                await websocket.close(code=4404, reason="Run not found")
                return
            if latest_run.updated_at != last_updated_at:
                last_updated_at = latest_run.updated_at
                await websocket.send_json({"type": "run.updated", "run": latest_run.model_dump(mode="json")})

            new_logs = store.read_logs_after(run_id, log_offset)
            if new_logs:
                log_offset += len(new_logs)
                await websocket.send_json({"type": "run.logs", "lines": new_logs})
    except (WebSocketDisconnect, asyncio.CancelledError, RuntimeError):
        pass
