# Testing and Usage Guide

This guide explains how to run, test, and play with the KubeGuardian control plane and the Terraform-driven cluster configuration behind it.

It is written for two use cases:
* You want to test the current backend/frontend scaffold locally.
* You want to understand the normal workflow a future user of the UI would follow.

---

## What You Are Running

There are three layers involved:
* Terraform in the repository root provisions AWS, EKS, observability, policies, wards, and workloads.
* `backend/` is a FastAPI service that reads and writes a managed Terraform config, runs `terraform plan`, runs `terraform apply`, and returns outputs.
* `frontend/` is a Vite + React UI that edits application templates and talks to the backend over HTTP.

The backend-generated Terraform input file is:

```text
frontend-managed.auto.tfvars.json
```

Terraform automatically loads `*.auto.tfvars.json`, so the backend can change the application config without overwriting your tracked template in [terraform.tfvars](/home/mihandrei/work/security-observability-cluster/terraform.tfvars).

---

## Quick Start

### 1. Start the Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 8000
```

Expected result:
* FastAPI starts on `http://127.0.0.1:8000`
* If `frontend-managed.auto.tfvars.json` does not exist yet, the backend creates it from the default template

### 2. Start the Frontend

```bash
cd frontend
npm install
npm run dev
```

Expected result:
* Vite starts on `http://127.0.0.1:5173`
* The UI loads and requests `/api/config` from the backend

### 3. Open the UI

Visit:

```text
http://127.0.0.1:5173
```

You should see:
* a template list on the left
* a basic editor and JSON editors in the middle
* run history, logs, and outputs on the right

---

## Backend API Smoke Tests

You can test the backend even without the frontend.

### Health Check

```bash
curl http://127.0.0.1:8000/api/health
```

Expected result:
* `status` should be `ok`

### Read the Managed Config

```bash
curl http://127.0.0.1:8000/api/config | jq
```

Expected result:
* you should see the current template-driven Terraform config

### Reset the Config Back to the Default Template

```bash
curl -X POST http://127.0.0.1:8000/api/config/reset | jq
```

Expected result:
* the managed config is rewritten from `backend/app/default_managed_config.json`

### Start a Terraform Plan

```bash
curl -X POST http://127.0.0.1:8000/api/runs/plan | jq
```

Expected result:
* a run object is returned
* status starts as `pending` and then moves through `running` to `planned` or `failed`

### Inspect Run Status

Replace `<run_id>` with the returned run id:

```bash
curl http://127.0.0.1:8000/api/runs/<run_id> | jq
curl http://127.0.0.1:8000/api/runs/<run_id>/logs | jq
```

Expected result:
* run metadata and Terraform log lines are available

### Apply a Saved Plan

Only do this when you intentionally want Terraform to apply the saved plan:

```bash
curl -X POST http://127.0.0.1:8000/api/runs/<run_id>/apply | jq
```

Expected result:
* the plan run is converted into an apply run
* Terraform outputs become available after a successful apply

### Read Outputs

```bash
curl http://127.0.0.1:8000/api/outputs | jq
```

Expected result:
* you receive machine-readable Terraform outputs such as service endpoints and ingress hosts

---

## Frontend Testing Flow

This is the normal UI flow to test.

### 1. Basic Load Test

When the page opens:
* the app list should load
* the selected application JSON should populate
* the ward subjects JSON should populate
* previous runs should appear if they exist

If the editors are empty, test the backend first with `GET /api/config`.

### 2. Edit and Save the Template

Try:
* changing the app `name`
* changing `replicas`
* changing the ingress host
* editing the raw app JSON

Then click:

```text
Save Managed Config
```

Expected result:
* a success message appears
* `frontend-managed.auto.tfvars.json` is updated

### 3. Clone the Template

Click:

```text
Clone Selected Template
```

Expected result:
* a new app appears in the left sidebar
* the new app is a copy of the selected template with a suffixed name

### 4. Create a Plan

Click:

```text
Plan Terraform Changes
```

Expected result:
* a new run appears in Run History
* logs start streaming into the Run Logs panel
* the run eventually becomes `planned` or `failed`

### 5. Apply the Plan

When the selected run reaches `planned`, click:

```text
Apply Saved Plan
```

Expected result:
* the run changes to `applying`
* after success, Outputs should populate

---

## Safe Ways to Play With It

These are good low-risk edits to try first.

### Change Replica Count

In the selected app JSON, change:

```json
"replicas": 2
```

to:

```json
"replicas": 3
```

Expected Terraform behavior:
* plan should show a deployment update

### Change the Ingress Host

Change:

```json
"host": "template-app.lab.internal"
```

Expected Terraform behavior:
* plan should show an ingress update

### Add an Environment Variable

In the first container:

```json
"env": {
  "APP_PROFILE": "template",
  "APP_MODE": "frontend-managed",
  "FEATURE_FLAG": "true"
}
```

Expected Terraform behavior:
* plan should show a deployment template update

### Clone the Template Into a Second App

Use the UI clone action or add another object to `ward_applications`.

Expected Terraform behavior:
* a second deployment, service, and possibly ingress/network policy set should be planned

### Change a Network Policy Rule

For example, modify an ingress or egress port in `network_policy`.

Expected Terraform behavior:
* plan should show a network policy update

This is a good way to learn how your zero-trust model behaves.

---

## Recommended Manual Test Cases

### Backend Tests

* Start backend and confirm `/api/health` returns `ok`
* Confirm `/api/config` returns a valid config
* Confirm `/api/config/reset` restores the default template
* Confirm `/api/runs/plan` starts a run
* Confirm `/api/runs/{id}/logs` returns logs
* Confirm `/api/outputs` returns values after apply

### Frontend Tests

* Page loads without console errors
* Selecting a different app updates the JSON editor
* Saving config persists changes
* Invalid JSON blocks save/plan and surfaces an error
* Clone creates a second app
* Remove deletes the selected app when more than one exists
* Plan starts and run history updates
* Apply only works after a planned run

### Terraform/Cluster Tests

* `terraform validate` passes from repo root
* plan works with `enable_custom_runtime_policies = false`
* cluster comes up and outputs are available
* after setting `enable_custom_runtime_policies = true`, a second plan/apply works

---

## Working With Terraform Safely

The backend is designed around this safer workflow:

1. Save config
2. Create plan
3. Review plan and logs
4. Apply saved plan
5. Read outputs

That is intentional. Avoid directly wiring “edit form -> immediate apply” unless you also introduce:
* user confirmation
* locking
* audit logging
* authentication

---

## Useful Files to Watch While Testing

If you want to understand what the system is doing, keep an eye on:

* [frontend-managed.auto.tfvars.json](/home/mihandrei/work/security-observability-cluster/frontend-managed.auto.tfvars.json)
  This is what the backend writes for Terraform consumption.

* [backend/app/default_managed_config.json](/home/mihandrei/work/security-observability-cluster/backend/app/default_managed_config.json)
  This is the seed template used by the backend reset flow.

* [backend/app/terraform_runner.py](/home/mihandrei/work/security-observability-cluster/backend/app/terraform_runner.py)
  This is where plan/apply execution is orchestrated.

* [frontend/src/App.tsx](/home/mihandrei/work/security-observability-cluster/frontend/src/App.tsx)
  This is the operator UI entry point.

* [outputs.tf](/home/mihandrei/work/security-observability-cluster/outputs.tf)
  These are the machine-readable results the backend can return to the UI.

---

## Troubleshooting

### `terraform plan` fails from the backend

Things to check:
* Terraform is installed and available in `PATH`
* backend is running from the repository context
* AWS credentials are configured
* remote backend is initialized if you use one

### Custom resource errors about Kubernetes REST client config

Keep:

```hcl
enable_custom_runtime_policies = false
```

for the first infrastructure pass. Turn it on only after the cluster is up and reachable.

### Frontend shows stale data

Try:
* saving config again
* reloading the page
* checking `/api/config`
* checking run logs in `/api/runs/{id}/logs`

### Outputs are empty

Outputs are only available after a successful apply.

### `npm run dev` or frontend build issues

Make sure you ran:

```bash
npm install
```

inside `frontend/`.

---

## Suggested Next Improvements

After this MVP, the next practical upgrades would be:

* add authentication to the backend
* add a proper run queue and cancellation support
* show a structured Terraform plan summary in the frontend
* add form-based editing for the common app fields
* emit backend events over WebSockets instead of polling
* store run history in SQLite or Postgres instead of local files

---

## Short Version

If you only want the shortest path:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 8000
```

```bash
cd frontend
npm install
npm run dev
```

Then:
1. open `http://127.0.0.1:5173`
2. edit the template app
3. save config
4. plan
5. apply
6. inspect outputs
