from __future__ import annotations

from .config import Settings
from .repositories import AuthRepository, ConfigRepository, RunRepository, SchemaRepository


class PostgresStore(SchemaRepository, AuthRepository, ConfigRepository, RunRepository):
    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.settings.state_dir.mkdir(parents=True, exist_ok=True)
        self.settings.runs_dir.mkdir(parents=True, exist_ok=True)
        self._initialize_database()
