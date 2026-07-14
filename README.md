# Isolens

Isolens is a Terraform-driven EKS lab with a small control plane:

- `backend/` runs a FastAPI service that stores editable config, queues Terraform runs, and streams run events.
- `frontend/` is a Vite + React operator UI for editing ward/application config and driving staged Terraform actions.
- `infrastructure/stages/bootstrap/` creates the remote-state bucket and shared ECR repositories.
- `infrastructure/stages/core/` creates the AWS foundation and EKS cluster.
- `infrastructure/stages/platform/` creates the in-cluster add-ons, ward namespaces, control-plane namespace, and PostgreSQL service after core is live.
- `infrastructure/stages/policies/` creates the Kyverno and Tetragon custom resources after platform is live.
- `infrastructure/stages/applications/` creates workloads after the shared platform layer is live.

This document reflects the code that exists in the repository today, not the long-term intent.

## Current State

The current implementation provisions or manages:

- AWS VPC and EKS through the `terraform-aws-modules/vpc/aws` and `terraform-aws-modules/eks/aws` modules
- EKS access entries for configured admin IAM principals
- ECR repositories for backend and frontend container images
- Cilium with Hubble enabled as the primary EKS CNI using AWS ENI IPAM
- Tetragon
- Kyverno
- conditional `ingress-nginx` when any ward application still declares `ingress.class_name = "nginx"`
- a Helm release named `lgtm` that currently installs the `grafana-agent` chart
- ward namespaces, quotas, baseline network policies, workloads, and outputs
- an internal-only Hubble access path through `kubectl port-forward`
- an operator UI that can load single-app templates or replace a ward with a bundled proof scenario

Two important reality checks:

- The repo currently uses standard Kubernetes `NetworkPolicy` resources for workload isolation. It does not yet define Cilium L7 policy resources.
- The monitoring release is explicitly pinned and still installs `grafana-agent`; it is not a full maintained LGTM stack.
- Hubble is currently intended to stay internal to the cluster. The UI helps you reach it through a local `kubectl port-forward`, not through a public auth gateway.

## Repository Map

- [backend/README.md](backend/README.md): API, auth, run lifecycle, persistence, environment variables
- [frontend/README.md](frontend/README.md): UI structure, runtime behavior, local development
- [infrastructure/stages/core/README.md](infrastructure/stages/core/README.md): core-stage resources, inputs, outputs, caveats
- [infrastructure/stages/platform/README.md](infrastructure/stages/platform/README.md): platform-stage resources, inputs, outputs, and provider behavior
- [infrastructure/stages/policies/README.md](infrastructure/stages/policies/README.md): policy-stage resources, inputs, outputs, and ordering
- `infrastructure/stages/applications/`: workload-only Terraform root with its own state boundary
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md): commit convention, local hooks, PR quality gates, and release automation
- [TESTING_AND_USAGE.md](TESTING_AND_USAGE.md): local bring-up, smoke tests, and operator workflow

## Terraform Stages

The Terraform is intentionally split:

1. `bootstrap`
   Creates the S3 bucket used by the remote state backends and the shared ECR repositories.

2. `core`
   Owns AWS infrastructure, the EKS cluster, and cluster-admin access bootstrap.

3. `platform`
   Owns Helm add-ons, ward namespaces, the control-plane namespace, PostgreSQL, and most operator-facing outputs.

4. `policies`
   Owns Kyverno and Tetragon custom resources after the platform layer has installed the required CRDs.

5. `applications`
   Owns workload deployments, Services, Ingresses, and app-specific network policies.

## Operator Workflow

The UI is intentionally split between three kinds of work:

- `Overview`
  run Terraform stages in order, inspect stage status, and launch the internal Hubble handoff
- `Assets`
  manage wards, edit applications, load single-app templates, and load proof scenarios
- `Activity`
  inspect run history, live logs, Terraform outputs, and prune older runs

Inside `Assets`, there are now two different ways to provision workloads:

- `App Templates`
  single safe starting points such as a public FastAPI app, an internal FastAPI app, or a static NGINX probe
- `Scenario Library`
  bundled proof cases that replace the selected ward's current applications with a repeatable demo setup

Every active scenario also generates a `Scenario Playbook` in the UI. Those playbooks do not execute anything automatically. They tell you which commands to run and what proof to capture in Hubble, Tetragon, Kyverno logs, or Terraform run logs.

## Quick Start

### 1. Bootstrap remote state

```bash
cd infrastructure/stages/bootstrap
terraform init
terraform apply
```

The committed backend configs currently point at:

- `s3://isolens-lab/dev/core/terraform.tfstate`
- `s3://isolens-lab/dev/platform/terraform.tfstate`
- `s3://isolens-lab/dev/policies/terraform.tfstate`
- `s3://isolens-lab/dev/applications/terraform.tfstate`

### 2. Configure backend credentials

Copy `backend/.env.example` to `backend/.env` and point it at AWS credentials the backend process can actually use.

If you use AWS SSO, a common pattern is:

```bash
aws sso login --profile <your-profile>
```

and then set `AWS_PROFILE=<your-profile>` in the environment where the backend runs.

When running the backend in Docker Compose, run the container as your host UID/GID so it can use
your real `~/.aws` directory directly without creating root-owned SSO cache files. If your user is
not UID/GID `1000`, set `BACKEND_UID=$(id -u)` and `BACKEND_GID=$(id -g)` before `docker compose up`.

### 3. Run the control plane

With Docker Compose:

```bash
docker compose up --build
```

This exposes:

- frontend: `http://127.0.0.1:5173`
- backend: `http://127.0.0.1:8000`

### 4. Operate in stage order

The backend and UI enforce the intended order:

1. save config
2. plan `core`
3. apply the saved `core` plan
4. plan `platform`
5. apply the saved `platform` plan
6. plan `policies`
7. apply the saved `policies` plan
8. plan `applications`
9. apply the saved `applications` plan

Destroy order goes the other direction:

1. destroy `applications`
2. destroy `policies`
3. destroy `platform`
4. destroy `core`

## Backend Guardrails

The current backend behavior is intentionally conservative:

- plan/apply/destroy require at least one non-empty `cluster_admin_principal_arns` value
- only one run executes at a time
- apply always uses a saved plan and can be queued from the latest plan while that plan is `queued`, `running`, or `planned`
- a saved plan is single-use once an apply attempt has been created from it
- platform-stage planning is blocked until a successful core apply exists
- applications-stage planning is blocked until a successful platform apply exists
- platform destroy is blocked while the latest applications-stage apply is still active
- core destroy is blocked while the latest platform-stage apply is still active
- startup reconciliation marks stale queued/running runs as canceled or failed instead of leaving them stuck forever

Cancellation is supported, but canceling `apply` or `destroy` can still leave partial remote changes. The backend explicitly warns about that in run error messages.

## Managed Configuration Flow

The operator UI edits the JSON-backed config model, not raw `.tfvars` text.

- source template: `backend/app/default_managed_config.json`
- persisted managed config: `backend/state/managed-config.json`
- generated per-root tfvars:
  - `infrastructure/stages/core/managed.auto.tfvars.json`
  - `infrastructure/stages/platform/managed.auto.tfvars.json`
  - `infrastructure/stages/policies/managed.auto.tfvars.json`
  - `infrastructure/stages/applications/managed.auto.tfvars.json`
- Terraform runs use the stage-matching generated `managed.auto.tfvars.json`

That managed JSON file now explicitly carries `cluster_log_retention_in_days`, so the backend/frontend/Terraform path preserves the EKS control-plane log-retention setting instead of depending on an implicit default.

That canonical managed config also carries the full ward and workload inventory. Scenario loading is still implemented as managed config changes; selecting a scenario replaces the current ward's `ward_applications` with the bundle defined by that scenario.

## Current Caveats

- the monitoring release is still `grafana-agent`, even though the repo language historically referred to it as an LGTM stack.
- ingress resources only get a controller automatically for the `nginx` ingress class. Other classes are still treated as bring-your-own controller.
- `platform` and `applications` still depend on a live reachable cluster, so breaking cluster access outside Terraform can still complicate cleanup.
- scenario proof capture is guided in the UI, but evidence is not stored or exported automatically. Screenshots and command output still need to be gathered manually.

## Next Reads

For the actual day-to-day workflow, start with:

- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)
- [TESTING_AND_USAGE.md](TESTING_AND_USAGE.md)
