# Core Terraform Stage

The `core` stage owns both the AWS foundation and most of the in-cluster platform state.

## What This Stage Creates

### AWS foundation

- VPC via `terraform-aws-modules/vpc/aws`
- EKS cluster via `terraform-aws-modules/eks/aws`
- one managed node group
- an explicit CloudWatch log group for EKS control-plane logs
- EKS access entries and admin policy associations for configured IAM principals
- EKS control plane logging

### In-cluster platform add-ons

- Kyverno namespace and Helm release
- Cilium Helm release with Hubble enabled
- Tetragon Helm release
- conditional `ingress-nginx` when any application uses the `nginx` ingress class
- `monitoring-zone` namespace
- Helm release `lgtm` that currently installs the `grafana-agent` chart

### Ward resources from `analysis_subjects`

For each subject entry, core creates:

- a namespace
- a `ward-metadata` ConfigMap
- a `ResourceQuota`
- a `LimitRange`
- a default-deny `NetworkPolicy`
- a DNS egress `NetworkPolicy`

### Workload resources from `ward_applications`

For each application entry, core can create:

- a `Deployment`
- an optional generated ConfigMap
- an optional `Service`
- an optional same-namespace ingress allow policy
- optional ingress allowlist policies
- optional egress allowlist policies
- an optional `Ingress`

## Inputs

This stage consumes the shared config model:

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
- `analysis_subjects`
- `ward_applications`

Two particularly important inputs:

- `cluster_admin_principal_arns`
  The backend requires at least one value here before it will run plan/apply/destroy, because the stage manages Kubernetes and Helm resources after bootstrapping EKS access.
- `cluster_log_retention_in_days`
  This is now part of the managed backend/frontend config model, but the current UI shows it as read-only metadata rather than an editable field.
- `ward_applications[*].name`
  Application names must be globally unique because Terraform keys application resources by `app.name`.

## Outputs

Current outputs include:

- `cluster_name`
- `cluster_endpoint`
- `cluster_security_group_id`
- `cluster_log_group_name`
- `ward_namespaces`
- `monitoring_namespace`
- `monitoring_release_name`
- `kyverno_namespace`
- `update_kubeconfig_command`
- `ward_service_endpoints`
- `ward_kubectl_commands`
- `ward_ingress_hosts`
- `ingress_controller_namespace`

## Backend and State

This stage uses the committed backend config in `backend.hcl`.

The current committed backend points at:

```hcl
bucket       = "isolens-lab"
key          = "dev/core/terraform.tfstate"
region       = "eu-north-1"
encrypt      = true
use_lockfile = true
```

## Operational Notes

- The backend always runs `terraform init -reconfigure -backend-config=backend.hcl` before executing this stage.
- Applys are executed from saved plan files, not fresh `terraform apply -auto-approve`.
- A partial AWS-side failure can still leave orphaned resources that need import or cleanup.

## Current Caveats

- This stage mixes AWS infrastructure and in-cluster Kubernetes/Helm resources in one Terraform state. That is convenient for a small lab but makes some failure and destroy scenarios harder, especially if the cluster is manually deleted.
- The monitoring release still installs `grafana-agent`, not a full maintained LGTM stack.
- Only the `nginx` ingress class is automatically backed by a controller in this stage. Other ingress classes remain external dependencies.
- Workload isolation is implemented with standard Kubernetes `NetworkPolicy` resources, not Cilium L7 policy objects.

## Direct Terraform Usage

```bash
cd infrastructure/core
terraform init -reconfigure -backend-config=backend.hcl
terraform plan -var-file=../terraform.tfvars
terraform apply -var-file=../terraform.tfvars
```

When using the backend control plane, Terraform instead receives:

```text
-var-file ../frontend-managed.auto.tfvars.json
```
