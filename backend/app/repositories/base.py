from __future__ import annotations

import re
from datetime import datetime, timezone

import psycopg
from psycopg.rows import dict_row

from ..config import Settings


ANSI_ESCAPE_RE = re.compile(r"\x1B\[[0-?]*[ -/]*[@-~]")


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def strip_ansi(value: str) -> str:
    return ANSI_ESCAPE_RE.sub("", value)


def normalize_log_lines(lines: list[str]) -> list[str]:
    normalized: list[str] = []
    previous_blank = False

    for raw_line in lines:
        line = strip_ansi(raw_line).rstrip()
        is_blank = line.strip() == ""
        if is_blank:
            if previous_blank:
                continue
            previous_blank = True
            continue
        previous_blank = False
        normalized.append(line)

    return normalized


class BaseRepository:
    settings: Settings

    def _connection(self) -> psycopg.Connection:
        return psycopg.connect(self.settings.database_url, row_factory=dict_row)
