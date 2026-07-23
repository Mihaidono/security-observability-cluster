# Isolens

Isolens is a Terraform-driven EKS lab with a small operator control plane.

## Repository Layout

- `backend/`
  FastAPI backend for config storage, Terraform run orchestration, sessions, and audit logging
- `frontend/`
  Vite + React operator UI
- `docker/postgres-init/`
  local PostgreSQL bootstrap SQL for shared backend + Keycloak databases
- `infrastructure/stages/bootstrap/`
  remote state bucket and shared ECR repositories
- `infrastructure/stages/core/`
  AWS foundation and EKS cluster
- `infrastructure/stages/platform/`
  shared add-ons, control-plane workloads, Keycloak, and the shared RDS PostgreSQL database
- `infrastructure/stages/policies/`
  Kyverno and Tetragon policy resources
- `infrastructure/stages/applications/`
  ward workloads and app-facing resources

## Authentication Architecture

The control plane now uses:

- Keycloak for user identity
- backend-managed cookie sessions for UI/API traffic
- backend audit events tied to authenticated users

The frontend no longer uses a shared bearer token for normal operation.

Runtime split:

- `/auth` is proxied from the frontend to Keycloak
- `/api` is proxied from the frontend to the backend
- the backend exchanges OIDC authorization codes, validates Keycloak tokens, and creates local sessions

## Terraform Stage Ownership

Stages are intentionally split:

1. `bootstrap`
2. `core`
3. `platform`
4. `policies`
5. `applications`

Important boundary:

- `core` and `platform` are infrastructure-owned
- `policies` and `applications` are the stages the control plane can execute

## Local Development

Local Docker Compose now starts:

- PostgreSQL
- Keycloak
- backend
- runner
- frontend

The local `postgres` service hosts both:

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

Local Keycloak starts clean. After it is up, create the realm/client/user in the admin console before testing login.

## Documentation

- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)
- [infrastructure/stages/platform/README.md](infrastructure/stages/platform/README.md)
- [infrastructure/modules/control-plane/README.md](infrastructure/modules/control-plane/README.md)
- [TESTING_AND_USAGE.md](TESTING_AND_USAGE.md)
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)
