# Testing and Usage

This guide matches the current implementation as of July 23, 2026.

## Local Stack

The local Docker Compose stack now includes:

- PostgreSQL
- Keycloak
- backend
- runner
- frontend

The local `postgres` container is shared. It hosts:

- the `isolens` database for the backend
- the `keycloak` database for Keycloak

Start it with:

```bash
docker compose up --build
```

If you are switching from an older local stack where Keycloak used `dev-file`, reset the local volume first so the init SQL runs on a clean database directory:

```bash
docker compose down -v
docker compose up --build
```

Expected local endpoints:

- frontend: `http://127.0.0.1:5173`
- backend: proxied through frontend at `/api`
- Keycloak: proxied through frontend at `/auth`
- direct Keycloak debug port: `http://127.0.0.1:8081`

## Local Login

The Keycloak bootstrap admin is also available locally:

- username: `admin`
- password: `admin-password-change-me`

Those credentials are for local development only.

Before login works, create these in Keycloak:

- realm: `isolens`
- client: `isolens-web`
- redirect URI: `http://localhost:5173/auth/callback`
- web origin: `http://localhost:5173`
- client type: public with PKCE if `ISOLENS_OIDC_CLIENT_SECRET` is empty
- at least one user you can sign in with

## Local Smoke Test

1. Open `http://127.0.0.1:5173`
2. Sign in to the Keycloak admin console at `http://127.0.0.1:8081/auth`
3. Create the realm, client, and test user listed above
4. Click `Sign in` in the Isolens UI
5. Authenticate with the user you created
6. Confirm the UI loads the control-plane state
7. Open the `Accounts` tab and confirm the authenticated username and roles are visible

## Backend API Checks

Because auth is now cookie-backed, use a browser session for the easiest validation.

Important routes:

- `GET /api/auth/config`
- `GET /api/auth/session`
- `POST /api/auth/exchange`
- `POST /api/auth/logout`
- `GET /api/health`
- `GET /api/config`
- `GET /api/runs`

Expected behavior:

- unauthenticated requests to protected routes return `401`
- `GET /api/auth/session` returns `{"authenticated": false}` before login
- after login, `GET /api/auth/session` returns the mapped user profile
- WebSocket run streaming works without a token query parameter

## Frontend Validation

Verify:

- the login screen appears before authentication
- redirect to Keycloak uses `/auth`
- callback returns to `/auth/callback` and then back to `/`
- `Accounts` shows the signed-in identity
- `Stages`, `Assets`, and `Activity` load only after the session is established
- sign-out clears access and returns the UI to the login screen

## Terraform Validation

Static checks:

```bash
python3 -m py_compile backend/app/*.py
```

```bash
cd frontend
npm run build
```

```bash
terraform fmt infrastructure/modules/control-plane \
  infrastructure/stages/platform
```

For live Terraform checks against AWS:

```bash
cd infrastructure/stages/platform
terraform init -reconfigure -backend-config=backend.hcl
terraform validate
terraform plan
```

## Cluster Validation

After the platform stage is applied, verify:

```bash
kubectl -n isolens-system get deploy,po,svc
```

```bash
kubectl -n isolens-system get statefulset isolens-keycloak
```

```bash
kubectl -n isolens-system logs statefulset/isolens-keycloak
```

```bash
kubectl -n isolens-system exec deploy/isolens-backend -- printenv | grep '^ISOLENS_OIDC_'
```

```bash
kubectl -n isolens-system exec deploy/isolens-backend -- nc -vz <control-plane-rds-endpoint> 5432
```

```bash
kubectl -n isolens-system logs job/isolens-keycloak-database-bootstrap
```

Expected results:

- backend, frontend, runner, and Keycloak are running
- Keycloak is healthy and ready for manual realm/client configuration
- backend has OIDC environment configured
- backend can reach the shared PostgreSQL instance

## Hubble

Hubble remains an internal handoff:

```bash
kubectl -n kube-system port-forward svc/hubble-ui 12000:80
```

Then open:

```text
http://127.0.0.1:12000
```
