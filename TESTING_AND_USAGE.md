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
- runner: background Terraform worker process used for queued plan/apply/destroy runs

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
- `stages: ["core", "platform", "policies"]`

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
4. plan `platform`
5. apply the saved `platform` plan
6. plan `policies`
7. apply the saved `policies` plan

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

Use the run ID from the latest stage plan:

```bash
PLAN_RUN_ID=<plan_run_id>

curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/runs/$PLAN_RUN_ID/apply | jq
```

Important current rules:

- apply can be queued from a source plan while that plan is `queued`, `running`, or `planned`
- the apply only executes if the source plan finishes successfully as `planned`
- the saved plan file must still exist
- each saved plan is single-use once an apply attempt exists

If you need another apply attempt, create a fresh plan first.

### Plan platform

```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/runs/plan/platform | jq
```

Expected current behavior:

- blocked with `409` until a successful `core` apply exists

### Plan policies

```bash
curl -s -X POST \
  -H "Authorization: Bearer $TOKEN" \
  http://127.0.0.1:8000/api/runs/plan/policies | jq
```

Expected current behavior:

- blocked with `409` until a successful `platform` apply exists

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

- returns the latest effective combined outputs from the applied `core`, `platform`, and `policies` stages
- returns `404` if no successful apply has produced outputs yet

## Frontend Smoke Tests

After opening `http://127.0.0.1:5173`, confirm:

- the app loads without auth errors when the token matches the backend
- `Overview` shows stage cards for `core`, `platform`, and `policies`
- `Assets` shows editable subjects and applications
- `Activity` shows run history and per-run details
- `Settings` shows cluster profile and editable admin ARNs

Specific behavior to verify:

- `Plan platform` stays disabled until core has been applied
- `Plan policies` stays disabled until platform has been applied
- `Destroy core` is visually blocked while platform or policies are still effectively applied
- `Cancel run` is only enabled for queued or active runs
- selecting a run with no outputs clears the outputs panel instead of showing stale values
- `Keep latest 10` prunes older run history once no active or queued run is in progress
- loading a scenario in `Assets` replaces the selected ward's current applications and creates a matching `Scenario Playbook`

## Hubble Handoff

For the current internal-only Hubble path, run:

```bash
kubectl -n kube-system port-forward svc/hubble-ui 12000:80
```

Then open:

```text
http://127.0.0.1:12000
```

If you want to look only at one ward, append the namespace query parameter:

```text
http://127.0.0.1:12000/?namespace=ward-public-api
```

## Scenario Validation

The frontend now distinguishes between:

- `App Templates`
  single workloads you can keep editing freely
- `Scenario Library`
  repeatable demo bundles that replace the selected ward's current applications

After loading a scenario in `Assets`, verify:

- the ward app list now contains only that scenario's resources
- the `Scenario Playbooks` card appears for the ward
- the playbook lists the expected `kubectl` or `curl` commands
- the playbook explains what proof should appear in Hubble, Tetragon, Kyverno, or Terraform logs

High-value scenarios to test:

- `Public Ingress Proof`
  prove the ingress path with a host-header curl and a matching Hubble flow
- `Allowed East-West Call`
  prove same-namespace traffic can succeed when explicitly allowed
- `Blocked East-West Call`
  prove same-namespace traffic is dropped when that allow path is removed
- `Blocked Internet Egress`
  prove default-deny egress and runtime exec visibility
- `Kyverno Latest Tag Deny`
  prove the policy layer blocks a violating workload and leaves evidence in run logs and Kyverno logs

## Direct Terraform Validation

These are useful sanity checks independent of the UI:

```bash
cd infrastructure/core
terraform validate

cd ../platform
terraform validate

cd ../policies
terraform validate
```

## Troubleshooting

### AWS auth failures

If a run fails with missing credentials or SSO expiration:

- refresh the AWS credentials used by the backend process
- restart the backend if necessary so the new environment is picked up

### Platform apply fails on bootstrap Kubernetes auth

The current backend intentionally stops rather than retrying a reviewed plan with a fresh unreviewed apply. If you see the EKS access propagation error:

1. wait briefly
2. create a fresh reviewed plan
3. apply that new plan
2. create a fresh plan
3. apply that new plan

### CloudWatch log group already exists

If the apply reports the EKS control-plane log group already exists, you are usually dealing with a partial earlier apply. Either:

- import the log group into the current Terraform state with:
  `terraform import aws_cloudwatch_log_group.eks_cluster '/aws/eks/<cluster-name>/cluster'`
- or delete the orphaned log group in AWS and create a fresh plan

### Provider/plugin schema loading errors

If `terraform validate` fails before schema loading, the local provider binaries or runtime environment are the problem rather than the control plane code. Re-run `terraform init` in a clean environment or validate outside restrictive sandboxes.
