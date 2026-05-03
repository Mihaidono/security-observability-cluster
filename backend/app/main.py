from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Header, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from .auth import require_api_token, require_websocket_token
from .config import Settings, get_settings
from .events import RunEventBroker
from .models import HealthResponse, ObservabilityLinksResponse, OutputsResponse, RunListResponse, RunLogsResponse, RunStage, TerraformConfig, TerraformRun
from .store import SqliteStore
from .terraform_runner import TerraformRunner


settings = get_settings()
store = SqliteStore(settings)
broker = RunEventBroker()
runner = TerraformRunner(settings, store, broker)


def auth_dependency(
    authorization: str | None = Header(default=None),
) -> None:
    require_api_token(settings=settings, authorization=authorization)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await runner.start()
    try:
        yield
    finally:
        await runner.stop()


app = FastAPI(
    title="Isolens Control Plane",
    version="0.2.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse, dependencies=[Depends(auth_dependency)])
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        active_run_id=runner.active_run_id,
        managed_tfvars_present=settings.managed_tfvars_path.exists(),
        queue_depth=runner.queue_depth,
        auth_enabled=True,
        stages=[RunStage.core, RunStage.policies],
    )


@app.get("/api/config", response_model=TerraformConfig, dependencies=[Depends(auth_dependency)])
async def get_config() -> TerraformConfig:
    return store.load_config()


@app.put("/api/config", response_model=TerraformConfig, dependencies=[Depends(auth_dependency)])
async def save_config(config: TerraformConfig) -> TerraformConfig:
    store.save_config(config)
    return config


@app.post("/api/config/reset", response_model=TerraformConfig, dependencies=[Depends(auth_dependency)])
async def reset_config() -> TerraformConfig:
    return store.reset_config()


@app.get("/api/runs", response_model=RunListResponse, dependencies=[Depends(auth_dependency)])
async def list_runs() -> RunListResponse:
    return RunListResponse(items=store.list_runs())


@app.get("/api/runs/{run_id}", response_model=TerraformRun, dependencies=[Depends(auth_dependency)])
async def get_run(run_id: str) -> TerraformRun:
    run = store.load_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run


@app.get("/api/runs/{run_id}/logs", response_model=RunLogsResponse, dependencies=[Depends(auth_dependency)])
async def get_run_logs(run_id: str) -> RunLogsResponse:
    run = store.load_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return RunLogsResponse(run_id=run_id, logs=store.read_logs(run_id))


@app.post("/api/runs/plan/{stage}", response_model=TerraformRun, dependencies=[Depends(auth_dependency)])
async def start_plan(stage: RunStage) -> TerraformRun:
    return await runner.start_plan(stage)


@app.post("/api/runs/{run_id}/apply", response_model=TerraformRun, dependencies=[Depends(auth_dependency)])
async def start_apply(run_id: str) -> TerraformRun:
    return await runner.start_apply(run_id)


@app.post("/api/runs/destroy/{stage}", response_model=TerraformRun, dependencies=[Depends(auth_dependency)])
async def start_destroy(stage: RunStage) -> TerraformRun:
    return await runner.start_destroy(stage)


@app.post("/api/runs/{run_id}/cancel", response_model=TerraformRun, dependencies=[Depends(auth_dependency)])
async def cancel_run(run_id: str) -> TerraformRun:
    return await runner.cancel_run(run_id)


@app.get("/api/outputs", response_model=OutputsResponse, dependencies=[Depends(auth_dependency)])
async def get_outputs() -> OutputsResponse:
    outputs = store.latest_outputs()
    if outputs is None:
        raise HTTPException(status_code=404, detail="No outputs are available yet.")
    return OutputsResponse(outputs=outputs)


@app.get("/api/observability/links", response_model=ObservabilityLinksResponse, dependencies=[Depends(auth_dependency)])
async def get_observability_links() -> ObservabilityLinksResponse:
    return ObservabilityLinksResponse(
        hubble_ui_url=settings.hubble_ui_url,
        hubble_available=bool(settings.hubble_ui_url),
    )


@app.get("/api/observability/hubble-ui")
async def open_hubble_ui(token: str | None = Query(default=None)) -> RedirectResponse:
    require_api_token(settings=settings, authorization=f"Bearer {token}" if token else None)
    if not settings.hubble_ui_url:
        raise HTTPException(status_code=404, detail="Hubble UI is not configured.")
    return RedirectResponse(url=settings.hubble_ui_url, status_code=307)


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

    queue = broker.subscribe(run_id)
    await websocket.accept()
    await websocket.send_json({"type": "run.snapshot", "run": run.model_dump(mode="json"), "logs": store.read_logs(run_id)})

    try:
        while True:
            event = await queue.get()
            await websocket.send_json(event)
    except (WebSocketDisconnect, asyncio.CancelledError):
        pass
    finally:
        broker.unsubscribe(run_id, queue)
