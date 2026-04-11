from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .models import HealthResponse, OutputsResponse, RunListResponse, RunLogsResponse, TerraformConfig, TerraformRun
from .store import FileStore
from .terraform_runner import TerraformRunner


settings = get_settings()
store = FileStore(settings)
runner = TerraformRunner(settings, store)

app = FastAPI(title="KubeGuardian Control Plane", version="0.1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        active_run_id=runner.active_run_id,
        managed_tfvars_present=settings.managed_tfvars_path.exists(),
    )


@app.get("/api/config", response_model=TerraformConfig)
async def get_config() -> TerraformConfig:
    return store.load_config()


@app.put("/api/config", response_model=TerraformConfig)
async def save_config(config: TerraformConfig) -> TerraformConfig:
    store.save_config(config)
    return config


@app.post("/api/config/reset", response_model=TerraformConfig)
async def reset_config() -> TerraformConfig:
    return store.reset_config()


@app.get("/api/runs", response_model=RunListResponse)
async def list_runs() -> RunListResponse:
    return RunListResponse(items=store.list_runs())


@app.get("/api/runs/{run_id}", response_model=TerraformRun)
async def get_run(run_id: str) -> TerraformRun:
    run = store.load_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run


@app.get("/api/runs/{run_id}/logs", response_model=RunLogsResponse)
async def get_run_logs(run_id: str) -> RunLogsResponse:
    run = store.load_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return RunLogsResponse(run_id=run_id, logs=store.read_logs(run_id))


@app.post("/api/runs/plan", response_model=TerraformRun)
async def start_plan() -> TerraformRun:
    return await runner.start_plan()


@app.post("/api/runs/{run_id}/apply", response_model=TerraformRun)
async def start_apply(run_id: str) -> TerraformRun:
    return await runner.start_apply(run_id)


@app.get("/api/outputs", response_model=OutputsResponse)
async def get_outputs() -> OutputsResponse:
    runs = store.list_runs()
    for run in runs:
        if run.outputs:
            return OutputsResponse(outputs=run.outputs)
    raise HTTPException(status_code=404, detail="No outputs are available yet.")
