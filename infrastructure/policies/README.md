# Policies Terraform Stage

The `policies` stage owns the manifest layer that depends on the in-cluster platform created by `platform`.

It does not create the cluster, namespaces, or Helm add-ons. It assumes those already exist.

## What This Stage Creates

### Kyverno policies

The stage currently creates two cluster-scoped Kyverno policies:

- `require-ward-subject-label`
  requires pods in ward namespaces to carry the `isolens.io/subject` label
- `disallow-latest-tag-in-wards`
  blocks workloads that use `:latest` container image tags in ward namespaces

Even though these are cluster-scoped `ClusterPolicy` objects, they are effectively ward-focused because they only match namespaces with the `analysis-tier` label created by the platform stage.

### Tetragon tracing policies

For each `analysis_subjects` entry, the stage creates a namespaced `TracingPolicyNamespaced` named `suspicious-exec`.

The current selectors watch for execution of:

- `curl`
- `wget`
- `nc`
- `bash`
- `sh`

That means the current Tetragon behavior is ward-wide, not per-application. Any workload inside the ward can trigger the tracing policy.

## Prerequisites

This stage expects:

- the `platform` stage to have been applied successfully
- the EKS cluster to be reachable
- the target ward namespaces to already exist
- Kyverno CRDs to already exist
- Tetragon CRDs to already exist

The backend enforces the main stage-ordering rule by blocking policy-stage planning until a successful platform apply exists.

## Inputs

This stage accepts the shared tfvars payload so the same config file can be passed to both stages.

Inputs actually used by this stage:

- `project_name`
- `environment`
- `region`
- `cluster_name`
- `analysis_subjects`

Inputs accepted only for compatibility with the shared payload:

- `kubernetes_version`
- `vpc_cidr`
- `private_subnets`
- `public_subnets`
- `node_instance_types`
- `node_group_scaling`
- `cluster_admin_principal_arns`
- `ward_applications`

## Outputs

Current outputs:

- `kyverno_cluster_policies`
- `tetragon_policy_namespaces`

## Backend and State

This stage uses the committed backend config in `backend.hcl`.

The current committed backend points at:

```hcl
bucket       = "isolens-lab"
key          = "dev/policies/terraform.tfstate"
region       = "eu-north-1"
encrypt      = true
use_lockfile = true
```

## Provider Behavior

- AWS lookups are still done through the AWS provider.
- The Kubernetes provider targets the existing cluster endpoint and CA bundle from `data.aws_eks_cluster.this`.
- Authentication is refreshed through `aws eks get-token` via provider `exec` auth instead of relying on a single static token for the whole run.

## Current Caveats

- This stage depends on CRDs installed by the platform stage, so the stage order matters.
- The Kyverno policies target namespaces by the `analysis-tier` label, which the platform stage adds to ward namespaces.
- If the cluster is manually deleted or cluster access is broken, this stage cannot clean itself up independently.
- The current policies are intentionally small and evidence-oriented. They are good for demos and proof capture, but they are not yet a broad production policy catalog.

## Direct Terraform Usage

```bash
cd infrastructure/policies
terraform init -reconfigure -backend-config=backend.hcl
terraform plan -var-file=../terraform.tfvars
terraform apply -var-file=../terraform.tfvars
```

When using the backend control plane, Terraform instead receives:

```text
-var-file ../frontend-managed.auto.tfvars.json
```

## Terraform Reference

<!-- BEGIN_TF_DOCS -->
<!-- END_TF_DOCS -->
