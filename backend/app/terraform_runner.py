from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import HTTPException

from .config import Settings
from .models import PlanSummary, RunKind, RunStatus, TerraformRun
from .store import FileStore


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TerraformRunner:
    def __init__(self, settings: Settings, store: FileStore) -> None:
        self.settings = settings
        self.store = store
        self._lock = asyncio.Lock()
        self._active_run_id: str | None = None

    @property
    def active_run_id(self) -> str | None:
        return self._active_run_id

    def _new_run(self, kind: RunKind, status: RunStatus, command: list[str]) -> TerraformRun:
        run_id = uuid.uuid4().hex[:12]
        run_dir = self.store.run_dir(run_id)
        run = TerraformRun(
            id=run_id,
            kind=kind,
            status=status,
            created_at=utc_now(),
            updated_at=utc_now(),
            command=command,
            plan_path=str(run_dir / "planned.tfplan"),
            log_path=str(run_dir / "run.log"),
        )
        self.store.save_run(run)
        return run

    async def start_plan(self) -> TerraformRun:
        if self._lock.locked():
            raise HTTPException(status_code=409, detail=f"Another Terraform run is active: {self._active_run_id}")

        run = self._new_run(RunKind.plan, RunStatus.pending, [])
        plan_file = Path(run.plan_path)
        run.command = [
            self.settings.terraform_bin,
            "plan",
            "-input=false",
            "-no-color",
            "-out",
            str(plan_file),
            "-var-file",
            str(self.settings.managed_tfvars_path),
        ]
        self.store.save_run(run)
        asyncio.create_task(self._execute_plan(run.id))
        return run

    async def start_apply(self, run_id: str) -> TerraformRun:
        if self._lock.locked():
            raise HTTPException(status_code=409, detail=f"Another Terraform run is active: {self._active_run_id}")

        run = self.store.load_run(run_id)
        if run is None:
            raise HTTPException(status_code=404, detail="Run not found.")
        if run.kind != RunKind.plan or run.status != RunStatus.planned:
            raise HTTPException(status_code=409, detail="Only a completed plan run can be applied.")

        updated = run.model_copy(update={"kind": RunKind.apply, "status": RunStatus.pending, "updated_at": utc_now()})
        updated.command = [
            self.settings.terraform_bin,
            "apply",
            "-input=false",
            "-json",
            str(Path(updated.plan_path)),
        ]
        self.store.save_run(updated)
        asyncio.create_task(self._execute_apply(updated.id))
        return updated

    async def _execute_plan(self, run_id: str) -> None:
        async with self._lock:
            self._active_run_id = run_id
            run = self.store.load_run(run_id)
            if run is None:
                self._active_run_id = None
                return

            run.status = RunStatus.running
            run.updated_at = utc_now()
            self.store.save_run(run)

            plan_file = Path(run.plan_path)
            try:
                await self._stream_command(
                    run_id,
                    [
                        self.settings.terraform_bin,
                        "plan",
                        "-input=false",
                        "-no-color",
                        "-out",
                        str(plan_file),
                        "-var-file",
                        str(self.settings.managed_tfvars_path),
                    ],
                    cwd=self.settings.repo_root,
                )

                show_payload = await self._capture_json(
                    [
                        self.settings.terraform_bin,
                        "show",
                        "-json",
                        str(plan_file),
                    ],
                    cwd=self.settings.repo_root,
                )
                self.store.save_json_artifact(run_id, "plan.json", show_payload)
                run.plan_summary = summarize_plan(show_payload)
                run.status = RunStatus.planned
                run.updated_at = utc_now()
                self.store.save_run(run)
            except Exception as exc:  # noqa: BLE001
                run.status = RunStatus.failed
                run.error = str(exc)
                run.updated_at = utc_now()
                self.store.save_run(run)
            finally:
                self._active_run_id = None

    async def _execute_apply(self, run_id: str) -> None:
        async with self._lock:
            self._active_run_id = run_id
            run = self.store.load_run(run_id)
            if run is None:
                self._active_run_id = None
                return

            run.status = RunStatus.applying
            run.updated_at = utc_now()
            self.store.save_run(run)

            try:
                await self._stream_command(
                    run_id,
                    [
                        self.settings.terraform_bin,
                        "apply",
                        "-input=false",
                        "-json",
                        str(Path(run.plan_path)),
                    ],
                    cwd=self.settings.repo_root,
                )

                outputs_payload = await self._capture_json(
                    [self.settings.terraform_bin, "output", "-json"],
                    cwd=self.settings.repo_root,
                )
                run.outputs = outputs_payload
                run.status = RunStatus.applied
                run.updated_at = utc_now()
                self.store.save_run(run)
                self.store.save_json_artifact(run_id, "outputs.json", outputs_payload)
            except Exception as exc:  # noqa: BLE001
                run.status = RunStatus.failed
                run.error = str(exc)
                run.updated_at = utc_now()
                self.store.save_run(run)
            finally:
                self._active_run_id = None

    async def _stream_command(self, run_id: str, command: list[str], cwd: Path) -> None:
        proc = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
        )

        lines: list[str] = []
        assert proc.stdout is not None
        while True:
            raw = await proc.stdout.readline()
            if not raw:
                break
            line = raw.decode("utf-8", errors="replace").rstrip()
            lines.append(line)
            self.store.append_logs(run_id, [line])

        exit_code = await proc.wait()
        if exit_code != 0:
            raise RuntimeError(f"{' '.join(command)} failed with exit code {exit_code}")

    async def _capture_json(self, command: list[str], cwd: Path) -> dict[str, Any]:
        proc = await asyncio.create_subprocess_exec(
            *command,
            cwd=str(cwd),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
        stdout, stderr = await proc.communicate()
        if proc.returncode != 0:
            raise RuntimeError(stderr.decode("utf-8", errors="replace").strip() or "Terraform command failed.")
        return json.loads(stdout.decode("utf-8"))


def summarize_plan(payload: dict[str, Any]) -> PlanSummary:
    create = update = delete = replace = 0
    addresses: list[str] = []

    for change in payload.get("resource_changes", []):
        actions = change.get("change", {}).get("actions", [])
        address = change.get("address")
        if address:
            addresses.append(address)

        if actions == ["create"]:
            create += 1
        elif actions == ["update"]:
            update += 1
        elif actions == ["delete"]:
            delete += 1
        elif actions == ["delete", "create"] or actions == ["create", "delete"]:
            replace += 1

    return PlanSummary(
        create=create,
        update=update,
        delete=delete,
        replace=replace,
        addresses=addresses[:50],
    )
