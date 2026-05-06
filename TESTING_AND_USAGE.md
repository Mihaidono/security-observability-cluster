# Testing and Usage

This guide matches the current implementation in the repository.

## Prerequisites

- Docker and Docker Compose, or local Python/Node toolchains
- Terraform installed if you want to run stage commands outside the backend
- AWS credentials that the backend process can use
- remote state bucket bootstrapped in `infrastructure/bootstrap`

## Local Bring-Up

### 1. Prepare backend environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` so the backend can actually reach AWS.

### 2. Start the control plane

```bash
docker compose up --build
```

Endpoints:

- frontend: `http://127.0.0.1:5173`
- backend: `http://127.0.0.1:8000`

## Backend Smoke Tests

All API requests need:

```http
Authorization: Bearer <token>
```

Using the default token:

```bash
TOKEN=dev-token
```

### Health

```bash
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/health | jq
```

Expected:

- `status: "ok"`
- `stages: ["core", "policies"]`

### Config load

```bash
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/config | jq
```

Expected:

- cluster metadata
- `analysis_subjects`
- `ward_applications`

### Run list

```bash
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/runs | jq
```

## Terraform Stage Flow

The intended operational order is:

1. save config
2. plan `core`
3. apply the saved `core` plan
4. plan `policies`
5. apply the saved `policies` plan

### Plan core

```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/runs/plan/core | jq
```

Expected behavior:

- run starts `queued`
- later moves to `running`
- ends as `planned`, `failed`, or `canceled`

### Apply a saved plan

Use the run ID from a completed plan:

```bash
PLAN_RUN_ID=<plan_run_id>

curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/runs/$PLAN_RUN_ID/apply | jq
```

Important current rules:

- only a `planned` run can be applied
- the saved plan file must still exist
- each saved plan is single-use once an apply attempt exists

If you need another apply attempt, create a fresh plan first.

### Plan policies

```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/runs/plan/policies | jq
```

Expected current behavior:

- blocked with `409` until a successful `core` apply exists

### Cancel a run

```bash
RUN_ID=<run_id>

curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/runs/$RUN_ID/cancel | jq
```

Expected:

- queued run -> `canceled`
- active run -> `canceling` then `canceled`

For `apply` and `destroy`, cancellation warning text should mention possible partial remote changes.

## Logs, Summaries, and Outputs

### Run details

```bash
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/runs/$RUN_ID | jq
```

### Run logs

```bash
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/runs/$RUN_ID/logs | jq
```

### Latest outputs

```bash
curl -s \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/outputs | jq
```

Current behavior:

- returns the latest successful `core` apply outputs when available
- falls back to any successful apply with outputs if needed
- returns `404` if no successful apply has produced outputs yet

## Frontend Smoke Tests

After opening `http://127.0.0.1:5173`, confirm:

- the app loads without auth errors when the token matches the backend
- `Overview` shows stage cards for `core` and `policies`
- `Assets` shows editable subjects and applications
- `Activity` shows run history and per-run details
- `Settings` shows cluster profile and editable admin ARNs

Specific behavior to verify:

- `Plan policies` stays disabled until core has been applied
- `Cancel run` is only enabled for queued or active runs
- selecting a run with no outputs clears the outputs panel instead of showing stale values

## Hubble Handoff

If Hubble UI is reachable from your workstation, a common local setup is:

```bash
kubectl -n kube-system port-forward svc/hubble-ui 12000:80
```

Set in `backend/.env`:

```env
ISOLENS_HUBBLE_UI_URL=http://127.0.0.1:12000
```

Then restart the backend. The frontend `Open Hubble UI` button should redirect through the backend helper route.

## Direct Terraform Validation

These are useful sanity checks independent of the UI:

```bash
cd infrastructure/core
terraform validate

cd ../policies
terraform validate
```

## Troubleshooting

### AWS auth failures

If a run fails with missing credentials or SSO expiration:

- refresh the AWS credentials used by the backend process
- restart the backend if necessary so the new environment is picked up

### Core apply fails on bootstrap Kubernetes auth

The current backend intentionally stops rather than retrying a reviewed plan with a fresh unreviewed apply. If you see the EKS access propagation error:

1. wait briefly
2. create a fresh plan
3. apply that new plan

### CloudWatch log group already exists

If the apply reports the EKS control-plane log group already exists, you are usually dealing with a partial earlier apply. Either:

- import the log group into the current Terraform state with:
  `terraform import aws_cloudwatch_log_group.eks_cluster '/aws/eks/<cluster-name>/cluster'`
- or delete the orphaned log group in AWS and create a fresh plan

### Provider/plugin schema loading errors

If `terraform validate` fails before schema loading, the local provider binaries or runtime environment are the problem rather than the control plane code. Re-run `terraform init` in a clean environment or validate outside restrictive sandboxes.
