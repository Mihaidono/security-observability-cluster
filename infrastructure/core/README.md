# Core Terraform Stage

The `core` stage owns the AWS network and EKS foundation for the lab.

## What This Stage Creates

- VPC via `terraform-aws-modules/vpc/aws`
- EKS cluster via `terraform-aws-modules/eks/aws`
- one managed node group
- an explicit CloudWatch log group for EKS control-plane logs
- EKS access entries and cluster-admin policy associations for configured IAM principals

The `core` stage does not create namespaces, Helm releases, workloads, or policy CRDs anymore. Those live in the `platform` and `applications` stages.

## Inputs

This stage actively uses:

- `project_name`
- `environment`
- `region`
- `cluster_name`
- `kubernetes_version`
- `cluster_log_retention_in_days`
- `vpc_cidr`
- `private_subnets`
- `public_subnets`
- `node_instance_types`
- `node_group_scaling`
- `cluster_admin_principal_arns`
## Outputs

Current outputs include:

- `cluster_name`
- `cluster_endpoint`
- `cluster_security_group_id`
- `cluster_log_group_name`
- `update_kubeconfig_command`

## Backend and State

This stage uses the committed backend config in `backend.hcl`.

```hcl
bucket       = "isolens-lab"
key          = "dev/core/terraform.tfstate"
region       = "eu-north-1"
encrypt      = true
use_lockfile = true
```

## Operational Notes

- The backend always runs `terraform init -reconfigure -backend-config=backend.hcl` before executing this stage.
- Applies are executed from saved plan files, not fresh `terraform apply -auto-approve`.
- This stage should finish before planning `platform`.
- The operator UI blocks `platform` while core is not effectively applied, and it visually blocks `core` destroy while downstream stages still exist.

## Direct Terraform Usage

```bash
cd infrastructure/core
terraform init -reconfigure -backend-config=backend.hcl
terraform plan -var-file=../terraform.tfvars
terraform apply -var-file=../terraform.tfvars
```

## Terraform Reference

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| terraform | >= 1.7.0 |
| aws | 5.100.0 |

## Modules

| Name | Source | Version |
| ---- | ------ | ------- |
| eks | terraform-aws-modules/eks/aws | 20.37.2 |
| vpc | terraform-aws-modules/vpc/aws | 5.21.0 |

## Resources

| Name | Type |
| ---- | ---- |
| [aws_cloudwatch_log_group.eks_cluster](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/cloudwatch_log_group) | resource |
| [aws_eks_access_entry.cluster_admins](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/eks_access_entry) | resource |
| [aws_eks_access_policy_association.cluster_admins](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/eks_access_policy_association) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| cluster_admin_principal_arns | IAM principal ARNs granted EKS cluster-admin access through access entries so the later platform and applications stages can manage in-cluster resources safely. | `list(string)` | `[]` | no |
| cluster_log_retention_in_days | Retention period, in days, for the EKS control-plane CloudWatch log group. | `number` | `90` | no |
| cluster_name | Name of the EKS cluster created by the core stage. | `string` | `"forensic-lab"` | no |
| environment | Environment name used for tags and naming. | `string` | `"lab"` | no |
| kubernetes_version | Kubernetes minor version requested for the EKS control plane. | `string` | `"1.35"` | no |
| node_group_scaling | Managed node group scaling configuration. | <pre>object({<br/>    min_size     = number<br/>    max_size     = number<br/>    desired_size = number<br/>  })</pre> | <pre>{<br/>  "desired_size": 2,<br/>  "max_size": 5,<br/>  "min_size": 2<br/>}</pre> | no |
| node_instance_types | Worker node instance types. | `list(string)` | <pre>[<br/>  "t3.xlarge"<br/>]</pre> | no |
| private_subnets | Private subnet CIDRs for worker nodes. | `list(string)` | <pre>[<br/>  "10.0.1.0/24",<br/>  "10.0.2.0/24"<br/>]</pre> | no |
| project_name | Logical project name used for tagging and cluster naming. | `string` | `"isolens"` | no |
| public_subnets | Public subnet CIDRs for load balancers and NAT. | `list(string)` | <pre>[<br/>  "10.0.101.0/24",<br/>  "10.0.102.0/24"<br/>]</pre> | no |
| region | AWS region where the core stage creates the VPC, EKS cluster, and stage-owned AWS resources. | `string` | `"eu-north-1"` | no |
| vpc_cidr | CIDR block for the lab VPC. | `string` | `"10.0.0.0/16"` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| cluster_endpoint | EKS API server endpoint. |
| cluster_log_group_name | CloudWatch log group receiving EKS control-plane logs. |
| cluster_name | Name of the provisioned EKS cluster. |
| cluster_security_group_id | Security group attached to the EKS control plane. |
| update_kubeconfig_command | Command to merge this cluster into the local kubeconfig. |
<!-- END_TF_DOCS -->
