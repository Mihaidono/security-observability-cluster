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
## Requirements

| Name | Version |
| ---- | ------- |
| terraform | >= 1.7.0 |
| aws | 5.100.0 |
| kubernetes | 2.37.1 |

## Modules

| Name | Source | Version |
| ---- | ------ | ------- |
| policy_manifests | ../modules/policies-stack | n/a |

## Resources

| Name | Type |
| ---- | ---- |
| [aws_eks_cluster.this](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/data-sources/eks_cluster) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| analysis_subjects | Ward namespace definitions consumed by namespaced Tetragon tracing policies and policy-stage outputs. The namespaces themselves must already exist from the platform stage. | <pre>map(object({<br/>    tier        = string<br/>    description = string<br/>    labels      = optional(map(string), {})<br/>    annotations = optional(map(string), {})<br/>    resource_quota = optional(object({<br/>      pods            = optional(string, "10")<br/>      requests_cpu    = optional(string, "2")<br/>      requests_memory = optional(string, "4Gi")<br/>      limits_cpu      = optional(string, "4")<br/>      limits_memory   = optional(string, "8Gi")<br/>    }), {})<br/>  }))</pre> | n/a | yes |
| cluster_admin_principal_arns | Accepted for compatibility with the shared tfvars payload. | `list(string)` | `[]` | no |
| cluster_log_retention_in_days | Accepted for compatibility with the shared tfvars payload. | `number` | `90` | no |
| cluster_name | Name of the existing EKS cluster targeted by the policies stage. | `string` | `"forensic-lab"` | no |
| environment | Environment name used for tags and naming. | `string` | `"lab"` | no |
| node_group_scaling | Accepted for compatibility with the shared tfvars payload. | <pre>object({<br/>    min_size     = number<br/>    max_size     = number<br/>    desired_size = number<br/>  })</pre> | <pre>{<br/>  "desired_size": 2,<br/>  "max_size": 5,<br/>  "min_size": 2<br/>}</pre> | no |
| node_instance_types | Accepted for compatibility with the shared tfvars payload. | `list(string)` | <pre>[<br/>  "t3.xlarge"<br/>]</pre> | no |
| private_subnets | Accepted for compatibility with the shared tfvars payload. | `list(string)` | <pre>[<br/>  "10.0.1.0/24",<br/>  "10.0.2.0/24"<br/>]</pre> | no |
| project_name | Logical project name used for tagging and cluster naming. | `string` | `"isolens"` | no |
| public_subnets | Accepted for compatibility with the shared tfvars payload. | `list(string)` | <pre>[<br/>  "10.0.101.0/24",<br/>  "10.0.102.0/24"<br/>]</pre> | no |
| region | AWS region of the existing EKS cluster and AWS lookups used by the policies stage. | `string` | `"eu-north-1"` | no |
| vpc_cidr | Accepted for compatibility with the shared tfvars payload. | `string` | `"10.0.0.0/16"` | no |
| ward_applications | Unused by this stage. Accepted so the shared tfvars payload can be passed unchanged to both Terraform stages. | `any` | `[]` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| kyverno_cluster_policies | Kyverno ClusterPolicy objects managed by the policies stage. |
| tetragon_policy_namespaces | Namespaces that receive Tetragon tracing policies. |
<!-- END_TF_DOCS -->
