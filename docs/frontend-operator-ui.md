# Frontend Operator UI

The frontend is a Vite + React control plane for the Isolens backend. It does not talk to Terraform directly.

## Authentication Model

The frontend no longer stores or sends a shared bearer token.

Current flow:

1. the UI calls `GET /api/auth/config`
2. the browser is redirected to Keycloak with Authorization Code + PKCE
3. Keycloak redirects back to `/auth/callback`
4. the frontend posts the authorization code and PKCE verifier to `POST /api/auth/exchange`
5. the backend sets an `HttpOnly` session cookie
6. later `fetch` and WebSocket requests use `credentials: "include"` and the same session

Because the session cookie is `HttpOnly`, frontend JavaScript does not read raw auth credentials.

## Runtime Model

Tabs:

- `Stages`
- `Assets`
- `Activity`
- `Accounts`

The UI loads:

- auth session from `GET /api/auth/session`
- config from `GET /api/config`
- run history from `GET /api/runs`
- health from `GET /api/health`

## Proxy Model

The frontend is the public web edge for both:

- `/api` -> backend
- `/auth` -> Keycloak

That applies to:

- local development through the Vite dev server proxy
- production container runtime through the bundled NGINX proxy

The WebSocket run stream uses the same origin and no longer appends a token query parameter.

## Local Development

Direct run:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Local Vite proxy variables:

- `VITE_DEV_BACKEND_PROXY_TARGET`
- `VITE_DEV_KEYCLOAK_PROXY_TARGET`

Optional override:

- `VITE_API_BASE_URL`

The normal local stack is still the repo-level Docker Compose flow.
Keycloak imports the bootstrap realm, client, and operator user during local startup, so sign-in works immediately unless you intentionally replace that seed data.

## Build

```bash
cd frontend
npm run build
```

## Production Runtime

The production frontend container expects:

- `BACKEND_HOST`
- `BACKEND_PORT`
- `KEYCLOAK_HOST`
- `KEYCLOAK_PORT`

## Accounts View

The `Accounts` tab now reflects the active authenticated user instead of the old shared-token placeholder. It shows:

- username
- display name
- email
- mapped Keycloak roles
- sign-out action
