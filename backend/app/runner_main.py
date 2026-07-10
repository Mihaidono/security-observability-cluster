from __future__ import annotations

import asyncio
import os
import socket
from contextlib import suppress

from .config import get_settings
from .store import PostgresStore
from .terraform_runner import TerraformRunner


class TerraformWorker:
    def __init__(self) -> None:
        self.settings = get_settings()
        self.store = PostgresStore(self.settings)
        self.runner = TerraformRunner(self.settings, self.store)
        self.worker_id = os.getenv("ISOLENS_WORKER_ID", f"{socket.gethostname()}-runner")
        self._stopping = False

    async def run_forever(self) -> None:
        while not self._stopping:
            self.store.reconcile_stale_workers(self.settings.worker_heartbeat_ttl_seconds)
            self.store.touch_worker(self.worker_id, None)

            run = self.store.claim_next_queued_run(self.worker_id)
            if run is None:
                await asyncio.sleep(self.settings.worker_poll_interval_seconds)
                continue

            heartbeat_task = asyncio.create_task(self._heartbeat(run.id))
            try:
                await self.runner.execute_claimed_run(run, self.worker_id)
            finally:
                heartbeat_task.cancel()
                with suppress(asyncio.CancelledError):
                    await heartbeat_task
                self.store.touch_worker(self.worker_id, None)
                self.store.refresh_queue_positions()

    async def _heartbeat(self, active_run_id: str) -> None:
        while True:
            self.store.touch_worker(self.worker_id, active_run_id)
            await asyncio.sleep(self.settings.worker_heartbeat_interval_seconds)

    def stop(self) -> None:
        self._stopping = True


async def main() -> None:
    worker = TerraformWorker()
    try:
        await worker.run_forever()
    finally:
        worker.stop()


if __name__ == "__main__":
    asyncio.run(main())
