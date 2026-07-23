from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, Request, WebSocket, WebSocketDisconnect

from ..auth import require_websocket_session
from ..models import RunListResponse, RunLogsResponse, RunPruneResponse, RunStage, TerraformRun, UnlockStateResponse
from .dependencies import (
    authenticated_user_dependency,
    run_service,
    set_audit_context,
    settings,
    store,
    unlock_runner,
)


router = APIRouter(tags=["runs"])


@router.get("/api/runs", response_model=RunListResponse, dependencies=[Depends(authenticated_user_dependency)])
async def list_runs() -> RunListResponse:
    return RunListResponse(items=store.list_runs())


@router.get(
    "/api/runs/{run_id}",
    response_model=TerraformRun,
    dependencies=[Depends(authenticated_user_dependency)],
)
async def get_run(run_id: str) -> TerraformRun:
    run = store.load_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return run


@router.get(
    "/api/runs/{run_id}/logs",
    response_model=RunLogsResponse,
    dependencies=[Depends(authenticated_user_dependency)],
)
async def get_run_logs(run_id: str) -> RunLogsResponse:
    run = store.load_run(run_id)
    if run is None:
        raise HTTPException(status_code=404, detail="Run not found.")
    return RunLogsResponse(run_id=run_id, logs=store.read_logs(run_id))


@router.post(
    "/api/runs/prune",
    response_model=RunPruneResponse,
    dependencies=[Depends(authenticated_user_dependency)],
)
async def prune_runs(request: Request, keep: int = Query(default=10, ge=0, le=200)) -> RunPruneResponse:
    if run_service.has_nonterminal_runs():
        raise HTTPException(
            status_code=409,
            detail="Cannot prune run history while another run is active or queued.",
        )

    set_audit_context(
        request,
        action="runs.prune",
        resource_type="runs",
        resource_id=str(keep),
        details={"keep": keep},
    )
    items, deleted_count = store.prune_runs(keep)
    return RunPruneResponse(
        items=items,
        deleted_count=deleted_count,
        kept_count=len(items),
    )


@router.post(
    "/api/runs/plan/{stage}",
    response_model=TerraformRun,
    dependencies=[Depends(authenticated_user_dependency)],
)
async def start_plan(request: Request, stage: RunStage) -> TerraformRun:
    set_audit_context(request, action="run.plan", resource_type="stage", resource_id=stage.value)
    return await run_service.start_plan(stage)


@router.post(
    "/api/runs/{run_id}/apply",
    response_model=TerraformRun,
    dependencies=[Depends(authenticated_user_dependency)],
)
async def start_apply(request: Request, run_id: str) -> TerraformRun:
    set_audit_context(request, action="run.apply", resource_type="run", resource_id=run_id)
    return await run_service.start_apply(run_id)


@router.post(
    "/api/runs/destroy/{stage}",
    response_model=TerraformRun,
    dependencies=[Depends(authenticated_user_dependency)],
)
async def start_destroy(request: Request, stage: RunStage) -> TerraformRun:
    set_audit_context(request, action="run.destroy", resource_type="stage", resource_id=stage.value)
    return await run_service.start_destroy(stage)


@router.post(
    "/api/state/unlock/{stage}",
    response_model=UnlockStateResponse,
    dependencies=[Depends(authenticated_user_dependency)],
)
async def unlock_state(request: Request, stage: RunStage) -> UnlockStateResponse:
    set_audit_context(request, action="state.unlock", resource_type="stage", resource_id=stage.value)
    return await unlock_runner.unlock_state(stage)


@router.post(
    "/api/runs/{run_id}/cancel",
    response_model=TerraformRun,
    dependencies=[Depends(authenticated_user_dependency)],
)
async def cancel_run(request: Request, run_id: str) -> TerraformRun:
    set_audit_context(request, action="run.cancel", resource_type="run", resource_id=run_id)
    return await run_service.cancel_run(run_id)


@router.websocket("/api/runs/{run_id}/events")
async def run_events(run_id: str, websocket: WebSocket) -> None:
    try:
        await require_websocket_session(websocket=websocket, settings=settings, store=store)
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
