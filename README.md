# Isolens

Isolens is a Terraform-driven EKS lab with a small control plane:

- `backend/` runs a FastAPI service that stores editable config, queues Terraform runs, and streams run events.
- `frontend/` is a Vite + React operator UI for editing ward/application config and driving staged Terraform actions.
- `infrastructure/core/` creates the AWS and in-cluster foundation.
- `infrastructure/policies/` applies the Kyverno and Tetragon manifest layer after core is live.

This document reflects the code that exists in the repository today, not the long-term intent.

## Current State

The current implementation provisions or manages:

- AWS VPC and EKS through the `terraform-aws-modules/vpc/aws` and `terraform-aws-modules/eks/aws` modules
- EKS access entries for configured admin IAM principals
- Cilium with Hubble enabled
- Tetragon
- Kyverno
- conditional `ingress-nginx` when any ward application declares `ingress.class_name = "nginx"`
- a Helm release named `lgtm` that currently installs the `grafana-agent` chart
- ward namespaces, quotas, baseline network policies, workloads, and outputs

Two important reality checks:

- The repo currently uses standard Kubernetes `NetworkPolicy` resources for workload isolation. It does not define Cilium L7 policy resources.
- The monitoring release is explicitly pinned and still installs `grafana-agent`; it is not a full maintained LGTM stack.

## Repository Map

- [backend/README.md](backend/README.md): API, auth, run lifecycle, persistence, environment variables
- [frontend/README.md](frontend/README.md): UI structure, runtime behavior, local development
- [infrastructure/core/README.md](infrastructure/core/README.md): core-stage resources, inputs, outputs, caveats
- [infrastructure/policies/README.md](infrastructure/policies/README.md): policy-stage resources, prerequisites, inputs, outputs
- [TESTING_AND_USAGE.md](TESTING_AND_USAGE.md): local bring-up, smoke tests, and operator workflow

## Terraform Stages

The Terraform is intentionally split:

1. `bootstrap`
   Creates the S3 bucket used by the remote state backends.

2. `core`
   Owns AWS infrastructure, the EKS cluster, Helm add-ons, ward namespaces, workloads, and operator-facing outputs.

3. `policies`
   Owns the manifest layer that depends on the cluster and CRDs already existing.

The backend and UI understand only two runnable stages: `core` and `policies`.

## Quick Start

### 1. Bootstrap remote state

```bash
cd infrastructure/bootstrap
terraform init
terraform apply
```

The committed backend configs currently point at:

- `s3://isolens-lab/dev/core/terraform.tfstate`
- `s3://isolens-lab/dev/policies/terraform.tfstate`

### 2. Configure backend credentials

Copy `backend/.env.example` to `backend/.env` and point it at AWS credentials the backend process can actually use.

If you use AWS SSO, a common pattern is:

```bash
aws sso login --profile <your-profile>
```

and then set `AWS_PROFILE=<your-profile>` in the environment where the backend runs.

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
4. plan `policies`
5. apply the saved `policies` plan

Destroy order goes the other direction:

1. destroy `policies`
2. destroy `core`

## Backend Guardrails

The current backend behavior is intentionally conservative:

- plan/apply/destroy require at least one non-empty `cluster_admin_principal_arns` value
- only one run executes at a time
- apply can only use a completed saved plan
- a saved plan is single-use once an apply attempt has been created from it
- policy-stage planning is blocked until a successful core apply exists
- core destroy is blocked while the latest policy-stage apply is still active
- startup reconciliation marks stale queued/running runs as canceled or failed instead of leaving them stuck forever

Cancellation is supported, but canceling `apply` or `destroy` can still leave partial remote changes. The backend explicitly warns about that in run error messages.

## Managed Configuration Flow

The operator UI edits the JSON-backed config model, not raw `.tfvars` text.

- source template: `backend/app/default_managed_config.json`
- persisted managed config: `infrastructure/frontend-managed.auto.tfvars.json`
- Terraform runs use `-var-file infrastructure/frontend-managed.auto.tfvars.json`

The shared handwritten example file at `infrastructure/terraform.tfvars` remains useful for direct Terraform usage and reference data, but the backend itself operates on the managed JSON file.

That managed JSON file now explicitly carries `cluster_log_retention_in_days`, so the backend/frontend/Terraform path preserves the EKS control-plane log-retention setting instead of depending on an implicit default.

## Current Caveats

- `core` mixes AWS infrastructure and in-cluster Kubernetes/Helm resources in one state, so manual cluster deletion can make cleanup harder.
- the monitoring release is still `grafana-agent`, even though the repo language historically referred to it as an LGTM stack.
- ingress resources only get a controller automatically for the `nginx` ingress class. Other classes are still treated as bring-your-own controller.

## Next Reads

For the actual day-to-day workflow, start with:

- [backend/README.md](backend/README.md)
- [frontend/README.md](frontend/README.md)
- [TESTING_AND_USAGE.md](TESTING_AND_USAGE.md)
