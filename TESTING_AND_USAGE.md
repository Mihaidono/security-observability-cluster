# Testing and Usage Guide

This guide is for the current control plane implementation:
* FastAPI backend with bearer-token auth
* SQLite-backed run history
* queued `terraform plan` / `terraform apply`
* run cancellation
* WebSocket run events
* form-based ward and app editors

## What Gets Written

The backend manages two generated artifacts:

```text
infrastructure/frontend-managed.auto.tfvars.json
backend/state/kubeguardian.db
```

`infrastructure/frontend-managed.auto.tfvars.json` is the Terraform input written by the backend.  
`backend/state/kubeguardian.db` stores run metadata and logs.

## Quick Start

### 1. Start the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
export KUBEGUARDIAN_API_TOKEN=dev-token
uvicorn app.main:app --reload --port 8000
```

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

You should see:
* cluster settings
* subject list and subject form
* application list and application form
* run history, plan summary, logs, and outputs

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
  http://127.0.0.1:8000/api/runs/plan | jq
```

Expected:
* a run object with `status: "queued"`
* later it becomes `running`, then `planned` or `failed`

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

1. Edit cluster settings if needed.
2. Add or adjust subjects in the left column.
3. Add or adjust applications in the left column.
4. Use the middle forms to configure service, ingress, containers, probes, volumes, and network policy.
5. Click `Save`.
6. Click `Plan`.
7. Review the structured plan summary and live logs.
8. Click `Apply` only after the plan is satisfactory.
9. Read outputs in the right column.

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
* `/api/runs/plan` queues a run
* `/api/runs/{id}/cancel` cancels queued and active runs correctly
* `/api/outputs` returns values after a successful apply

### Frontend

* page loads without console errors
* no raw JSON editor is required for common changes
* selecting a different subject updates the subject form
* selecting a different app updates the app form
* save persists the managed config
* plan summary counts render after a successful plan
* run logs update live without polling
* cancel works for queued or active runs
* apply only enables after a `planned` run

### Terraform and cluster

* first pass works with `enable_custom_runtime_policies = false`
* cluster outputs are available after apply
* second pass works after enabling custom runtime policies

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
2. queue a plan
3. inspect summary and logs
4. apply the saved plan
5. inspect outputs

Avoid wiring UI changes directly to `terraform apply`.

## Useful Files While Testing

* [frontend-managed.auto.tfvars.json](/home/mihandrei/work/security-observability-cluster/infrastructure/frontend-managed.auto.tfvars.json)
* [default_managed_config.json](/home/mihandrei/work/security-observability-cluster/backend/app/default_managed_config.json)
* [kubeguardian.db](/home/mihandrei/work/security-observability-cluster/backend/state/kubeguardian.db)
* [terraform_runner.py](/home/mihandrei/work/security-observability-cluster/backend/app/terraform_runner.py)
* [main.py](/home/mihandrei/work/security-observability-cluster/backend/app/main.py)
* [App.tsx](/home/mihandrei/work/security-observability-cluster/frontend/src/App.tsx)

## Troubleshooting

### `401 Unauthorized`

Check:
* `KUBEGUARDIAN_API_TOKEN` in the backend shell
* `VITE_API_TOKEN` in the frontend shell
* the token input in the top bar if you changed it after page load

### Run logs do not update

Check:
* selected run is the active run
* browser console for WebSocket errors
* backend is reachable from the frontend dev server

### `terraform plan` fails from the backend

Check:
* Terraform is installed
* AWS credentials are configured
* `terraform init` has been run inside `infrastructure/`
* remote backend is initialized if you use one
* the cluster bootstrap phase is complete before enabling custom runtime policies

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
export KUBEGUARDIAN_API_TOKEN=dev-token
uvicorn app.main:app --reload --port 8000
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
4. plan
5. review summary and logs
6. apply
7. inspect outputs
