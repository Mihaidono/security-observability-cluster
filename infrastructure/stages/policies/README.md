# Policies Terraform Stage

The `policies` stage owns the Kyverno and Tetragon custom resources that depend on CRDs installed by the `platform` stage.

## Prerequisites

- the `core` stage must already be applied successfully
- the `platform` stage must already be applied successfully
- the EKS cluster must be reachable
- at least one configured cluster-admin IAM principal must already have access through the core stage

## Direct Terraform Usage

```bash
cd infrastructure/stages/policies
terraform init -reconfigure -backend-config=backend.hcl
terraform plan
terraform apply
```

## Terraform Reference

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| terraform | >= 1.7.0 |
| aws | 5.100.0 |
| kubernetes | 2.37.1 |
| time | 0.13.1 |

## Modules

| Name | Source | Version |
| ---- | ------ | ------- |
| policy_manifests | ../../modules/policies-stack | n/a |

## Resources

| Name | Type |
| ---- | ---- |
| [time_sleep.cluster_access_ready](https://registry.terraform.io/providers/hashicorp/time/0.13.1/docs/resources/sleep) | resource |
| [aws_eks_cluster.this](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/data-sources/eks_cluster) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| analysis_subjects | Ward namespace definitions that receive Kyverno and Tetragon policy resources. | `map(any)` | `{}` | no |
| cluster_admin_principal_arns | IAM principal ARNs granted cluster-admin access in the core stage. Used here to keep the readiness wait tied to access configuration changes. | `list(string)` | `[]` | no |
| cluster_name | Name of the existing EKS cluster targeted by the policies stage. | `string` | `"forensic-lab"` | no |
| environment | Environment name used for tags and naming. | `string` | `"lab"` | no |
| project_name | Logical project name used for tagging and naming. | `string` | `"isolens"` | no |
| region | AWS region of the existing EKS cluster targeted by the policies stage. | `string` | `"eu-north-1"` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| kyverno_cluster_policies | Kyverno ClusterPolicy objects managed by the policies stage. |
| tetragon_policy_namespaces | Namespaces that receive Tetragon tracing policies. |
| update_kubeconfig_command | Command to merge this cluster into the local kubeconfig. |
<!-- END_TF_DOCS -->
