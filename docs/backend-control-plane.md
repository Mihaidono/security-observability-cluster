# Backend Control Plane

The backend is a FastAPI service that:

- stores the editable Terraform-backed control-plane config
- queues and executes `terraform plan`, `apply`, and `destroy` for the app-managed stages
- persists run logs, outputs, workers, users, sessions, and audit events in PostgreSQL

## Authentication Model

The backend no longer uses a shared API token for normal UI traffic.

Current flow:

1. the frontend starts an OIDC Authorization Code + PKCE login against Keycloak
2. the backend exchanges the authorization code with Keycloak
3. the backend validates the returned ID token against Keycloak JWKS
4. the backend creates a local control-plane session
5. the browser keeps that session in an `HttpOnly` cookie
6. HTTP and WebSocket requests use that cookie automatically

Identity comes from Keycloak. Authorization and audit logging stay in the backend.

## Runtime Behavior

The backend only executes the app-managed stages:

- `policies`
- `applications`

The `core` and `platform` stages remain visible in the managed config and outputs, but new runs for those stages are intentionally rejected because they are infrastructure-owned.

## Persistence

PostgreSQL stores:

- managed config state
- Terraform runs
- run logs
- worker heartbeats
- control-plane users mapped from Keycloak subjects
- control-plane sessions
- audit events

The managed config file is still mirrored to:

- `backend/state/managed-config.json`

Generated per-stage tfvars are still written to:

- `backend/state/tfvars/core.tfvars.json`
- `backend/state/tfvars/platform.tfvars.json`
- `backend/state/tfvars/policies.tfvars.json`
- `backend/state/tfvars/applications.tfvars.json`

Committed stage baselines live under:

- `infrastructure/variables/<environment>/`

Terraform runs now pass var files explicitly instead of relying on stage-local `*.auto.tfvars.json` files.

## Key Routes

Authentication:

- `GET /api/auth/config`
- `GET /api/auth/session`
- `POST /api/auth/exchange`
- `POST /api/auth/logout`

Control-plane API:

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
- `POST /api/state/unlock/{stage}`
- `POST /api/runs/{run_id}/cancel`
- `GET /api/outputs`
- `WS /api/runs/{run_id}/events`

## Environment Variables

`backend/.env.example` is the current reference.

Important runtime values:

- `ISOLENS_DATABASE_URL`
- `ISOLENS_PUBLIC_APP_URL`
- `ISOLENS_OIDC_INTERNAL_BASE_URL`
- `ISOLENS_OIDC_REALM`
- `ISOLENS_OIDC_CLIENT_ID`
- `ISOLENS_OIDC_CLIENT_SECRET` (optional for public PKCE clients)
- `ISOLENS_SESSION_COOKIE_NAME`
- `ISOLENS_SESSION_COOKIE_SECURE`
- `ISOLENS_SESSION_TTL_SECONDS`
- `ISOLENS_CORS_ORIGINS`
- `TERRAFORM_BIN`
- `ISOLENS_TERRAFORM_VARIABLE_SET`

AWS credentials are still inherited from the backend process environment because Terraform runs from the backend/runner context.

## Local Development

Direct run:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

For the full local stack, use the repo-level Docker Compose flow so backend, runner, PostgreSQL, Keycloak, and frontend start together.
The local stack imports a bootstrap Keycloak realm, client, and operator user during startup.

## Validation

Minimum backend validation after changes:

```bash
python3 -m py_compile backend/app/*.py
```

For end-to-end auth validation, use [testing-and-validation.md](testing-and-validation.md).
