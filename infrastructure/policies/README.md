# Policies Terraform Stage

The `policies` stage owns the manifest layer that depends on the cluster created by `core`.

It does not create the cluster, namespaces, or Helm add-ons. It assumes those already exist.

## What This Stage Creates

### Kyverno policies

The stage currently creates two cluster-scoped Kyverno policies:

- `require-ward-subject-label`
  requires pods in ward namespaces to carry the `isolens.io/subject` label
- `disallow-latest-tag-in-wards`
  blocks workloads that use `:latest` container image tags in ward namespaces

### Tetragon tracing policies

For each `analysis_subjects` entry, the stage creates a namespaced `TracingPolicyNamespaced` named `suspicious-exec`.

The current selectors watch for execution of:

- `curl`
- `wget`
- `nc`
- `bash`
- `sh`

## Prerequisites

This stage expects:

- the `core` stage to have been applied successfully
- the EKS cluster to be reachable
- the target ward namespaces to already exist
- Kyverno CRDs to already exist
- Tetragon CRDs to already exist

The backend enforces the main stage-ordering rule by blocking policy-stage planning until a successful core apply exists.

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

The stage resolves cluster access through:

- `data.aws_eks_cluster.this`
- `data.aws_eks_cluster_auth.this`

and configures the Kubernetes provider against the existing cluster endpoint and CA bundle.

## Current Caveats

- This stage depends on CRDs installed by the core stage, but Terraform itself is not splitting those CRDs into a separate bootstrap layer. Operationally, that means the stage order matters.
- The Kyverno policies target namespaces by the `analysis-tier` label, which the core stage adds to ward namespaces.
- If the cluster is manually deleted or cluster access is broken, this stage cannot clean itself up independently.

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
