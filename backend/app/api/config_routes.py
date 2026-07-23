from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ..models import OutputsResponse, TerraformConfig
from .dependencies import authenticated_user_dependency, set_audit_context, store


router = APIRouter(tags=["config"])


@router.get(
    "/api/config",
    response_model=TerraformConfig,
    dependencies=[Depends(authenticated_user_dependency)],
)
async def get_config() -> TerraformConfig:
    return store.load_config()


@router.put(
    "/api/config",
    response_model=TerraformConfig,
    dependencies=[Depends(authenticated_user_dependency)],
)
async def save_config(request: Request, config: TerraformConfig) -> TerraformConfig:
    set_audit_context(
        request,
        action="config.save",
        resource_type="config",
        resource_id="managed-config",
    )
    store.save_config(config)
    return config


@router.post(
    "/api/config/reset",
    response_model=TerraformConfig,
    dependencies=[Depends(authenticated_user_dependency)],
)
async def reset_config(request: Request) -> TerraformConfig:
    set_audit_context(
        request,
        action="config.reset",
        resource_type="config",
        resource_id="managed-config",
    )
    return store.reset_config()


@router.get(
    "/api/outputs",
    response_model=OutputsResponse,
    dependencies=[Depends(authenticated_user_dependency)],
)
async def get_outputs() -> OutputsResponse:
    outputs = store.latest_outputs()
    return OutputsResponse(outputs=outputs or {})
