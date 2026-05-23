# Platform Terraform Stage

The `platform` stage owns everything that runs inside the already-created EKS cluster.

## What This Stage Creates

### Platform add-ons

- Cilium with Hubble enabled
- Tetragon Helm release
- Kyverno namespace and Helm release
- `monitoring-zone` namespace
- Helm release `lgtm`
- conditional `ingress-nginx` when any application uses the `nginx` ingress class

### Ward resources from `analysis_subjects`

For each subject entry, platform creates:

- a namespace
- a `ward-metadata` ConfigMap
- a `ResourceQuota`
- a `LimitRange`
- a default-deny `NetworkPolicy`
- a DNS egress `NetworkPolicy`

### Workload resources from `ward_applications`

For each application entry, platform can create:

- a `Deployment`
- an optional generated ConfigMap
- an optional `Service`
- optional ingress and egress allowlist `NetworkPolicy` resources
- an optional same-namespace ingress allow policy
- an optional `Ingress`

## Prerequisites

This stage expects:

- the `core` stage to have been applied successfully
- the EKS cluster to be reachable
- at least one configured cluster-admin IAM principal to already have access through the core stage

## Inputs

This stage actively uses:

- `project_name`
- `environment`
- `region`
- `cluster_name`
- `kubernetes_version`
- `cluster_admin_principal_arns`
- `analysis_subjects`
- `ward_applications`

It accepts the remaining shared tfvars fields only for compatibility with the single managed config payload.

## Outputs

Current outputs include:

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

```hcl
bucket       = "isolens-lab"
key          = "dev/platform/terraform.tfstate"
region       = "eu-north-1"
encrypt      = true
use_lockfile = true
```

## Provider Behavior

- AWS lookups are still done through the AWS provider.
- Kubernetes and Helm authenticate with `aws eks get-token` through provider `exec` auth instead of a single static token, which is more resilient for long-running Helm installs.

## Direct Terraform Usage

```bash
cd infrastructure/platform
terraform init -reconfigure -backend-config=backend.hcl
terraform plan -var-file=../terraform.tfvars
terraform apply -var-file=../terraform.tfvars
```
