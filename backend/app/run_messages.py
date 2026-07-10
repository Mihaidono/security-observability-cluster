from __future__ import annotations

from .models import RunKind


def canceled_run_message(kind: RunKind) -> str:
    if kind in {RunKind.apply, RunKind.destroy}:
        return "Run canceled by user. Terraform may have already changed remote infrastructure or state. Create a fresh plan before continuing."
    return "Run canceled by user."


def interrupted_run_message(kind: RunKind) -> str:
    if kind in {RunKind.apply, RunKind.destroy}:
        return "Run was interrupted by a backend restart or worker stop. Terraform may have partially changed remote infrastructure or state. Create a fresh plan before continuing."
    return "Run was interrupted by a backend restart or worker stop."
