# Frontend Operator UI

The frontend is a Vite + React control plane for the Isolens backend. It does not talk to Terraform directly.

## Authentication Model

The frontend no longer stores or sends a shared bearer token.

Current flow:

1. the UI calls `GET /api/auth/config`
2. the browser is redirected to Keycloak with Authorization Code + PKCE
3. Keycloak redirects back to `/login/callback`
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

The production image includes `frontend/public/favicon.png` and serves it at
`/favicon.png`. Its Nginx configuration proxies `/api` to the private backend
service and `/auth` to the private Keycloak service. The browser therefore only
needs access to the public frontend hostname.

For the deployed Terraform path, set `control_plane_public_app_url` to the
exact HTTPS origin users will open. That value is used for the OIDC redirect URI
and issuer validation; host-header or browser-origin overrides are not trusted.

## Accounts View

The `Account` tab reflects the active authenticated user. It shows:

- username
- display name
- email
- account subject/ID
- mapped Keycloak roles, or an explicit no-roles state
- current authenticated-session permissions when at least one role is present
- sign-out action

The backend currently protects API actions by authenticated session and does not
map individual Keycloak roles to separate application permissions. The
permissions shown in the UI therefore describe the access available to the
current authenticated session, not role-specific grants.

## Keycloak Login Theme

The Keycloak login page uses the Isolens theme from
`docker/keycloak-theme/isolens`. Local Compose mounts the theme into Keycloak;
the platform Terraform module mounts the same files through a ConfigMap and
selects the `isolens` login theme during realm bootstrap.

The login layout places the authentication card on the right and uses
`isolens-graphic.png` as the visual panel on the left. The page follows the
browser color preference and also reads the frontend's `isolens-theme-mode`
setting when available.

The theme favicon is `login/resources/img/favicon.png`. Terraform carries the
PNG through the Keycloak ConfigMap as binary data; local Compose mounts the
theme directory directly.

For an existing local Compose database, realm import settings are not reapplied
automatically. Select `isolens` under Keycloak Realm Settings → Themes, or
recreate the local database volume when that is acceptable. Terraform theme
changes trigger a Keycloak rollout through a content checksum annotation.
