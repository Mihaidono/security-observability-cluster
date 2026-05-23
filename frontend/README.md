# Frontend Operator UI

The frontend is a Vite + React operator console for the backend control plane. It does not talk to Terraform directly. All cluster changes go through the backend API.

## Stack

- React 19
- TypeScript
- Vite 6
- Tailwind CSS

## Runtime Model

The UI works with four tabs:

- `Overview`
  stage actions, stage status, and Hubble handoff
- `Assets`
  subject and application editing
- `Activity`
  run history, plan summary, logs, and Terraform outputs
- `Settings`
  read-only cluster profile and editable admin access ARNs

The UI loads:

- config from `GET /api/config`
- run history from `GET /api/runs`
- health from `GET /api/health`
- observability links from `GET /api/observability/links`

## Authentication

The frontend sends:

```http
Authorization: Bearer <token>
```

Token lookup order:

1. `localStorage["isolens-api-token"]`
2. `VITE_API_TOKEN`
3. fallback `dev-token`

This means the browser can override the build-time token by setting a new one through the UI flow that writes local storage.

## API Base URL Resolution

Current behavior in `src/lib/api.ts`:

- if `VITE_API_BASE_URL` is set, use it
- otherwise, if the page is served from port `5173`, assume backend is on `:8000`
- otherwise, use `window.location.origin`

The WebSocket run stream uses the same base URL and switches protocol automatically:

- `http` -> `ws`
- `https` -> `wss`

## What the UI Edits

The frontend edits the managed config model returned by the backend:

- cluster metadata is read-only
- `analysis_subjects` can be added, renamed, edited, and removed
- `ward_applications` can be added, edited, and removed
- `cluster_admin_principal_arns` can be edited in `Settings`

Current read-only cluster metadata includes:

- project
- environment
- cluster name
- Kubernetes version
- EKS control-plane log retention in days

After editing, `Save config` persists the entire config back to the backend.

The UI is editing structured JSON, not freeform HCL.

## Stage Actions

The UI exposes:

- `Plan core`
- `Apply core`
- `Destroy core`
- `Plan platform`
- `Apply platform`
- `Destroy platform`
- `Plan policies`
- `Apply policies`
- `Destroy policies`
- `Cancel run`

Important behavior:

- apply buttons operate on the latest planned run for that stage
- apply can be queued behind the latest stage plan while that plan is still running, and it will fail closed if the source plan does not finish successfully
- platform-stage actions stay disabled until a successful core apply exists
- policy-stage actions stay disabled until a successful platform apply exists
- cancel is only enabled for queued or active runs
- destroy uses a two-click arming pattern in the UI, but the backend still enforces the real safety checks

## Activity View

The Activity tab shows:

- selected run metadata
- structured plan summary
- source plan reference for apply runs
- live and persisted logs
- Terraform outputs

Output behavior reflects the current implementation:

- if the selected run has outputs, they are shown
- if the selected run has no outputs, the outputs panel is cleared
- if the app loads with no run selected, it falls back to `GET /api/outputs`

This prevents stale outputs from a different run from staying visible.

## Observability Handoff

The UI does not embed Hubble. It offers a handoff button that opens:

```text
/api/observability/hubble-ui?token=<token>
```

That backend route redirects to `ISOLENS_HUBBLE_UI_URL` when configured.

## Local Development

Run directly:

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0 --port 5173
```

Environment variables commonly used during local development:

- `VITE_API_TOKEN`
- `VITE_API_BASE_URL`

Or use the repo-level Docker Compose setup.

## Build

```bash
cd frontend
npm run build
```

## Current Limitations

- The UI is intentionally backend-driven. It cannot operate offline or apply Terraform locally in the browser.
- The Hubble button is only a redirect helper; there is no embedded observability dashboard in this app.
- The UI does not currently expose every Terraform input for editing. For example, `cluster_log_retention_in_days` is visible as read-only metadata, but changing it still requires editing the managed config file or extending the form.
