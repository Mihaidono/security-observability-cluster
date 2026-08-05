# Repository Overview

Isolens is a Terraform-driven EKS lab with an operator control plane for application-facing stages.

## Repository Layout

- `backend/`
  FastAPI backend for config storage, Terraform run orchestration, sessions, audit logging, and packaged SQL assets under `backend/app/sql/`
- `frontend/`
  Vite + React operator UI
- `docker/postgres-init/`
  local PostgreSQL bootstrap SQL for shared backend + Keycloak databases
- `infrastructure/stages/bootstrap/`
  remote state bucket and shared ECR repositories
- `infrastructure/stages/core/`
  AWS foundation and EKS cluster
- `infrastructure/stages/platform-prerequisites/`
  foundational Kubernetes CRDs required before platform planning
- `infrastructure/stages/platform/`
  shared add-ons, control-plane workloads, Keycloak, and the shared RDS PostgreSQL database
- `infrastructure/stages/policies/`
  Kyverno and Tetragon policy resources
- `infrastructure/stages/applications/`
  ward workloads and app-facing resources

## Authentication Architecture

The control plane uses:

- Keycloak for user identity
- backend-managed cookie sessions for UI and API traffic
- backend audit events tied to authenticated users

Runtime split:

- `/auth` is proxied from the frontend to Keycloak
- `/api` is proxied from the frontend to the backend
- the backend exchanges OIDC authorization codes, validates Keycloak tokens, and creates local sessions

## Terraform Stage Ownership

Stages are intentionally split:

1. `bootstrap`
2. `core`
3. `platform-prerequisites` (automatically reconciled by `platform`)
4. `platform`
5. `policies`
6. `applications`

Boundary:

- `core`, `platform-prerequisites`, and `platform` are infrastructure-owned
- `policies` and `applications` are the stages the control plane can execute

## Local Development

Local Docker Compose starts:

- PostgreSQL
- Keycloak
- backend
- runner
- frontend

The local `postgres` service hosts:

- the `isolens` backend database
- the `keycloak` database

Bring it up with:

```bash
docker compose up --build
```

Then open:

```text
http://127.0.0.1:5173
```

The local Keycloak container imports the bootstrap realm, OIDC client, and operator user automatically.

## Related Docs

- [backend-control-plane.md](backend-control-plane.md)
- [frontend-operator-ui.md](frontend-operator-ui.md)
- [testing-and-validation.md](testing-and-validation.md)
- [aws-iam-policies.md](aws-iam-policies.md)
- [contributing.md](contributing.md)
- [../infrastructure/stages/platform/README.md](../infrastructure/stages/platform/README.md)
- [../infrastructure/modules/control-plane/README.md](../infrastructure/modules/control-plane/README.md)
