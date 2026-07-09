# Backend Control Plane

The backend is a FastAPI service that owns three things:

- the editable Terraform input model used by the UI
- queued execution of `terraform plan`, `apply`, and `destroy`
- persisted run history, logs, outputs, and live event streaming

The managed config model now includes `cluster_log_retention_in_days`, so the backend preserves that Terraform input across load, reset, save, and run operations instead of relying on an implicit Terraform-only default.

## What It Loads

At startup the backend resolves paths relative to the repo root:

- default config template: `backend/app/default_managed_config.json`
- managed config file: `infrastructure/frontend-managed.auto.tfvars.json`
- Terraform roots:
  - `infrastructure/core`
  - `infrastructure/platform`
  - `infrastructure/applications`
- PostgreSQL database: configured by `ISOLENS_DATABASE_URL`
- per-run artifacts and logs: `backend/state/runs/<run_id>/`

If the managed config file does not exist yet, the backend seeds it from the default JSON template.

## Authentication

Every HTTP API route requires:

```http
Authorization: Bearer <token>
```

WebSocket connections use:

```text
/api/runs/{run_id}/events?token=<token>
```

The token comes from `ISOLENS_API_TOKEN` in `backend/.env`.

## Runtime Behavior

The backend does not apply Terraform directly from browser input. The flow is:

1. the frontend edits a JSON config model
2. `PUT /api/config` persists that model
3. backend run endpoints invoke Terraform from the stage directory with:
   `-var-file infrastructure/frontend-managed.auto.tfvars.json`

Before each plan/apply/destroy run, the backend performs:

```bash
terraform init -reconfigure -backend-config=backend.hcl
```

This keeps the stage pinned to its committed backend settings.

## Run Lifecycle

Supported run kinds:

- `plan`
- `apply`
- `destroy`

Supported stages:

- `core`
- `platform`
- `applications`

Run statuses:

- `queued`
- `running`
- `planned`
- `applying`
- `applied`
- `destroying`
- `destroyed`
- `canceling`
- `canceled`
- `failed`

Important guardrails implemented in `app/terraform_runner.py`:

- at least one non-empty cluster admin ARN is required before plan/apply/destroy
- `platform` plan/apply is blocked until there is a successful `core` apply
- `applications` plan/apply is blocked until there is a successful `platform` apply
- `apply` can be created from the latest plan while that source plan is `queued`, `running`, or `planned`, but it only executes if the plan finishes successfully as `planned`
- each saved plan is single-use once an apply attempt exists
- `platform` destroy is blocked while the latest applications-stage apply is still active
- `core` destroy is blocked while the latest platform-stage apply is still active
- stale queued/running runs are reconciled on backend startup

## Cancellation Semantics

Queued runs are canceled immediately.

Active runs are canceled by signaling the Terraform process group:

- `SIGTERM`
- then `SIGKILL` after a timeout if the process does not stop

This means canceling `apply` or `destroy` can still leave partial remote changes or drift. The backend stores explicit warning messages for those cases.

## Outputs and Summaries

After a successful `plan`, the backend tries to collect:

```bash
terraform show -json <saved-plan>
```

and stores a summarized create/update/delete/replace count plus a trimmed address list.

After a successful `apply`, the backend tries to collect:

```bash
terraform output -json
```

and stores the output payload on that run.

`GET /api/outputs` combines the latest effective applied outputs from `core`, `platform`, and `applications`, while ignoring stages that have already been destroyed.

## HTTP API

Current routes:

- `GET /api/health`
- `GET /api/config`
- `PUT /api/config`
- `POST /api/config/reset`
- `GET /api/runs`
- `GET /api/runs/{run_id}`
- `GET /api/runs/{run_id}/logs`
- `POST /api/runs/prune?keep=10`
- `POST /api/runs/plan/{stage}`
- `POST /api/runs/{run_id}/apply`
- `POST /api/runs/destroy/{stage}`
- `POST /api/runs/{run_id}/cancel`
- `GET /api/outputs`
- `WS /api/runs/{run_id}/events?token=...`

## Environment Variables

`backend/.env.example` is the current reference:

- `ISOLENS_API_TOKEN`: bearer token for API and WebSocket auth
- `TERRAFORM_BIN`: Terraform executable name or path
- `ISOLENS_CORS_ORIGINS`: comma-separated frontend origins
- AWS credential variables:
  - `AWS_PROFILE`
  - `AWS_SDK_LOAD_CONFIG`
  - `AWS_CONFIG_FILE`
  - `AWS_SHARED_CREDENTIALS_FILE`
  - `AWS_REGION`
  - `AWS_DEFAULT_REGION`

The backend inherits AWS credentials from its own process environment. If Terraform cannot authenticate, the fix is usually to refresh or replace the backend process credentials, not the frontend.

## Local Development

Install and run directly:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Or use the repo-level Docker Compose setup from the root README.

## Current Limitations

- The backend is intentionally single-worker and only executes one Terraform run at a time.
- Successful apply output collection is best-effort. If `terraform output -json` fails after the apply itself succeeded, the run still remains `applied`.
- `platform` and `applications` depend on a live cluster connection, so out-of-band cluster access issues can still interrupt destroy flows.
- The backend stores raw configuration and run metadata, but it does not store scenario evidence such as screenshots or operator notes.
