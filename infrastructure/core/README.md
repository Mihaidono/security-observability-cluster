# Core Terraform Stage

The `core` stage now owns only the AWS and EKS foundation for the lab.

## What This Stage Creates

- VPC via `terraform-aws-modules/vpc/aws`
- EKS cluster via `terraform-aws-modules/eks/aws`
- one managed node group
- an explicit CloudWatch log group for EKS control-plane logs
- EKS access entries and cluster-admin policy associations for configured IAM principals

The `core` stage does not create namespaces, Helm releases, workloads, or policy CRDs anymore. Those live in the `platform` and `policies` stages.

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

The shared config still passes `analysis_subjects` and `ward_applications`, but the root accepts them only for compatibility.

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
- The operator UI also blocks `platform` and `policies` while core is not effectively applied, and it visually blocks `core` destroy while downstream stages still exist.

## Direct Terraform Usage

```bash
cd infrastructure/core
terraform init -reconfigure -backend-config=backend.hcl
terraform plan -var-file=../terraform.tfvars
terraform apply -var-file=../terraform.tfvars
```
