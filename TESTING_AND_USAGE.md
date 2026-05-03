# Testing and Usage Guide

This guide is for the current control plane implementation:
* FastAPI backend with bearer-token auth
* SQLite-backed run history
* queued `terraform plan` / `terraform apply`
* run cancellation
* WebSocket run events
* form-based ward and app editors
* explicit `core` and `policies` Terraform stages

## What Gets Written

The backend manages two generated artifacts:

```text
infrastructure/frontend-managed.auto.tfvars.json
backend/state/isolens.db
```

`infrastructure/frontend-managed.auto.tfvars.json` is the Terraform input written by the backend.  
`backend/state/isolens.db` stores run metadata and logs.
`backend/.env` stores local backend runtime settings and AWS/Terraform environment variables.

Terraform execution happens in:

```text
infrastructure/core
infrastructure/policies
```

## Quick Start

### 1. Start the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
# edit .env with your AWS profile and token values
aws sso login --profile <your-profile>
uvicorn app.main:app --port 8000
```

That install now pulls in `uvicorn[standard]`, which is required for websocket run events.
The backend loads [backend/.env](/home/mihandrei/work/security-observability-cluster/backend/.env.example) on startup, and Terraform inherits AWS credentials from that backend environment.
Use `--reload` only when you explicitly want backend hot reload. Running without it is the cleaner default.
If you want the frontend to launch the real Hubble UI, set `ISOLENS_HUBBLE_UI_URL` in `backend/.env`.

### 2. Start the frontend

```bash
cd frontend
npm install
VITE_API_TOKEN=dev-token npm run dev
```

### 3. Open the UI

```text
http://127.0.0.1:5173
```

The frontend uses `http://127.0.0.1:8000` directly for API and websocket traffic during local dev. If you want a different backend origin, set `VITE_API_BASE_URL`.

## Docker Compose Quick Start

```bash
cp backend/.env.example backend/.env
# edit backend/.env
aws sso login --profile <your-profile>
docker compose up --build
```

Then open:
* `http://127.0.0.1:5173` for the frontend
* `http://127.0.0.1:8000/api/health` for backend health

Notes:
* the compose stack mounts `${HOME}/.aws` into the backend container
* if you use static AWS credentials instead of a profile, place them in `backend/.env`
* Terraform still runs inside the backend container, so that container must have valid AWS auth
* the backend container intentionally runs without Uvicorn `--reload` to avoid sticky shutdowns and unnecessary reloader process churn

You should see:
* a top control header with status, navigation, and config actions
* an `Overview` tab with deployment stages and Hubble handoff
* an `Assets` tab with subject-first navigation, scoped application lists, and modal-based editors
* an `Activity` tab with run history, plan summary, logs, and outputs
* a `Settings` tab with cluster profile and admin access

### Optional: local Hubble UI handoff

If Hubble UI is installed in the cluster, a common local setup is:

```bash
kubectl -n kube-system port-forward svc/hubble-ui 12000:80
```

Then set this in `backend/.env`:

```text
ISOLENS_HUBBLE_UI_URL=http://127.0.0.1:12000
```

After restarting the backend, the frontend `Open Hubble UI` button will launch the real Hubble interface in a new tab.

## Backend Smoke Tests

All API requests require the bearer token.

Set a shell helper first:

```bash
export KG_TOKEN=dev-token
```

### Health

```bash
curl -H "Authorization: Bearer $KG_TOKEN" \
  http://127.0.0.1:8000/api/health | jq
```

Expected:
* `status` is `ok`
* `queue_depth` is present

### Read config

```bash
curl -H "Authorization: Bearer $KG_TOKEN" \
  http://127.0.0.1:8000/api/config | jq
```

Expected:
* current managed Terraform config

### Reset config

```bash
curl -X POST -H "Authorization: Bearer $KG_TOKEN" \
  http://127.0.0.1:8000/api/config/reset | jq
```

Expected:
* config resets from [default_managed_config.json](/home/mihandrei/work/security-observability-cluster/backend/app/default_managed_config.json)

### Start a plan

```bash
curl -X POST -H "Authorization: Bearer $KG_TOKEN" \
  http://127.0.0.1:8000/api/runs/plan/core | jq
```

Expected:
* `stage` is `core`
* a run object with `status: "queued"`
* later it becomes `running`, then `planned` or `failed`

For the policies stage:

```bash
curl -X POST -H "Authorization: Bearer $KG_TOKEN" \
  http://127.0.0.1:8000/api/runs/plan/policies | jq
```

### Read run state and logs

```bash
curl -H "Authorization: Bearer $KG_TOKEN" \
  http://127.0.0.1:8000/api/runs/<run_id> | jq

curl -H "Authorization: Bearer $KG_TOKEN" \
  http://127.0.0.1:8000/api/runs/<run_id>/logs | jq
```

Expected:
* run metadata includes `queue_position` when queued
* logs stream into SQLite and the log endpoint

### Apply a saved plan

```bash
curl -X POST -H "Authorization: Bearer $KG_TOKEN" \
  http://127.0.0.1:8000/api/runs/<run_id>/apply | jq
```

Expected:
* a new apply run is created
* it starts queued, then applying, then applied or failed

### Cancel a queued or active run

```bash
curl -X POST -H "Authorization: Bearer $KG_TOKEN" \
  http://127.0.0.1:8000/api/runs/<run_id>/cancel | jq
```

Expected:
* queued runs move to `canceled`
* active runs move through `canceling` to `canceled`

### Read outputs

```bash
curl -H "Authorization: Bearer $KG_TOKEN" \
  http://127.0.0.1:8000/api/outputs | jq
```

Expected:
* latest successful apply outputs

## Frontend Usage Flow

This is the normal developer workflow in the UI:

1. Add or adjust subjects from the `Assets` tab.
2. Select a subject to see the applications assigned to that ward.
3. Add or adjust applications from that subject-scoped application list.
4. Open `Edit subject` or `Edit app` to configure service, ingress, containers, probes, volumes, and network policy.
5. Click `Save`.
6. Move to `Overview` and click `Plan core`.
7. Review the structured plan summary and live logs.
8. Click `Apply core`.
9. Once core is live, click `Plan policies`.
10. Review that plan and click `Apply policies`.
11. Move to `Activity` to inspect outputs and logs.

## What To Try In The UI

### Subject changes

Try:
* rename a ward namespace
* change subject labels
* reduce or increase resource quota values

Expected Terraform effect:
* namespace labels, metadata, and quota objects update

### App basics

Try:
* rename the app
* move it to another subject
* change replicas

Expected Terraform effect:
* deployment updates

### Service and ingress

Try:
* change service port
* add a service annotation
* enable ingress and set a host

Expected Terraform effect:
* service and ingress resources update

### Containers

Try:
* add a second container
* change image
* add environment variables
* add secret env sources
* enable probes

Expected Terraform effect:
* deployment template updates

### Volumes

Try:
* add an `emptyDir`
* add a Secret volume
* mount it into a container

Expected Terraform effect:
* pod spec updates

### Network policy

Try:
* add an ingress rule from a labeled pod selector
* add an egress rule to an IP block on port `443`

Expected Terraform effect:
* app-specific network policy updates

## Recommended Manual Test Cases

### Backend

* `/api/health` returns `ok` with auth
* `/api/config` returns the managed config
* `/api/config/reset` restores the seed template
* `/api/runs/plan/core` queues a core run
* `/api/runs/plan/policies` is only used after a successful core apply
* `/api/runs/{id}/cancel` cancels queued and active runs correctly
* `/api/outputs` returns values after a successful apply

### Frontend

* page loads without console errors
* no raw JSON editor is required for common changes
* selecting a different subject updates the workspace summary and the correct subject opens in the modal editor
* selecting a different app updates the workspace summary and the correct app opens in the modal editor
* save persists the managed config
* plan summary counts render after a successful plan
* run logs update live without polling
* cancel works for queued or active runs
* `Apply core` only enables after a core `planned` run
* `Apply policies` only enables after a policies `planned` run

### Terraform and cluster

* `terraform init` succeeds in `infrastructure/core`
* `terraform init` succeeds in `infrastructure/policies`
* cluster outputs are available after a successful core apply
* policy manifests plan and apply after core is live

## WebSocket Check

The frontend uses:

```text
WS /api/runs/{run_id}/events?token=...
```

You can verify the stream manually in browser devtools or with a WebSocket client.  
Expected event types:
* `run.snapshot`
* `run.updated`
* `run.logs`

## Safe Terraform Workflow

The intended sequence is:

1. save config
2. plan core
3. inspect summary and logs
4. apply core
5. plan policies
6. apply policies
7. inspect outputs

Avoid wiring UI changes directly to `terraform apply`.

## Useful Files While Testing

* [frontend-managed.auto.tfvars.json](/home/mihandrei/work/security-observability-cluster/infrastructure/frontend-managed.auto.tfvars.json)
* [default_managed_config.json](/home/mihandrei/work/security-observability-cluster/backend/app/default_managed_config.json)
* [isolens.db](/home/mihandrei/work/security-observability-cluster/backend/state/isolens.db)
* [terraform_runner.py](/home/mihandrei/work/security-observability-cluster/backend/app/terraform_runner.py)
* [main.py](/home/mihandrei/work/security-observability-cluster/backend/app/main.py)
* [App.tsx](/home/mihandrei/work/security-observability-cluster/frontend/src/App.tsx)

## Troubleshooting

### `401 Unauthorized`

Check:
* `ISOLENS_API_TOKEN` in the backend shell
* `VITE_API_TOKEN` in the frontend shell

### Run logs do not update

Check:
* selected run is the active run
* browser console for WebSocket errors
* backend is reachable from the frontend dev server

### `terraform plan` fails from the backend

Check:
* Terraform is installed
* AWS credentials are configured
* `terraform init` has been run inside both `infrastructure/core` and `infrastructure/policies`
* remote backend is initialized for each stage if you use one
* `core` has already been successfully applied before planning or applying `policies`

### Outputs are empty

Outputs appear only after a successful apply.

### `terraform validate` fails in this environment

If provider schema loading fails, the local Terraform plugin binaries are the problem rather than the control plane code. Re-run `terraform init` in a clean environment or verify provider compatibility on the machine where Terraform is installed.

## Implemented Control Plane Upgrades

The earlier MVP follow-up items are now in the repo:
* backend auth
* queued runs
* cancellation support
* structured plan summary in the UI
* form-based editing for wards and apps
* WebSocket run events
* SQLite-backed run history

## Short Version

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
cp .env.example .env
# edit .env with your AWS profile and token values
aws sso login --profile <your-profile>
uvicorn app.main:app --port 8000
```

```bash
cd frontend
npm install
VITE_API_TOKEN=dev-token npm run dev
```

Then:
1. open `http://127.0.0.1:5173`
2. edit a subject or app through the forms
3. save
4. plan core
5. apply core
6. plan policies
7. apply policies
8. inspect outputs
