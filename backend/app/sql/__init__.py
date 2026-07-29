from __future__ import annotations

from dataclasses import dataclass
from importlib.resources import files


@dataclass(frozen=True)
class SqlCatalog:
    queries: dict[str, str]

    def __getattr__(self, name: str) -> str:
        try:
            return self.queries[name]
        except KeyError as exc:
            raise AttributeError(name) from exc


def _load_catalog(filename: str) -> SqlCatalog:
    content = files(__name__).joinpath(filename).read_text(encoding="utf-8")
    queries: dict[str, str] = {}
    current_name: str | None = None
    current_lines: list[str] = []

    for raw_line in content.splitlines():
        if raw_line.startswith("-- name:"):
            if current_name is not None:
                queries[current_name] = "\n".join(current_lines).strip()
            current_name = raw_line.removeprefix("-- name:").strip()
            current_lines = []
            continue
        current_lines.append(raw_line)

    if current_name is not None:
        queries[current_name] = "\n".join(current_lines).strip()

    return SqlCatalog(queries=queries)


auth = _load_catalog("auth.sql")
config_state = _load_catalog("config_state.sql")
runs = _load_catalog("runs.sql")
schema = _load_catalog("schema.sql")

__all__ = ["auth", "config_state", "runs", "schema", "SqlCatalog"]
