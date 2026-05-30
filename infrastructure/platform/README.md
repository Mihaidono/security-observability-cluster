# Platform Terraform Stage

The `platform` stage owns everything that runs inside the already-created EKS cluster.

## What This Stage Creates

### Platform add-ons

- Cilium with Hubble enabled, chained on top of the AWS VPC CNI plugin
- optional dedicated `hubble.lab.internal` ingress for Hubble UI
- optional Keycloak and oauth2-proxy stack for protecting observability endpoints
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

## Cilium Bootstrap Notes

- The current platform design uses the Cilium-supported AWS VPC CNI chaining mode on EKS rather than Cilium ENI IPAM mode.
- This keeps the EKS `aws-node` daemonset responsible for pod IP allocation and baseline node networking while still letting Cilium provide policy enforcement, Hubble, and the foundation for Tetragon.
- Workload creation still waits for the add-on layer, so operator-managed apps are created only after the platform stack succeeds.

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

### Observability endpoint access

- `expose_hubble_ui=true` creates a dedicated Hubble ingress at `hubble.lab.internal`
- `observability_ingress_whitelist_cidrs` can restrict that ingress by source CIDR through `ingress-nginx`
- `enable_observability_identity=true` installs Keycloak and oauth2-proxy for platform-managed SSO
- `protect_hubble_ui_with_identity=true` places Hubble behind oauth2-proxy using ingress-nginx external auth
- `hubble_ui_ingress_annotations` can still layer in additional ingress behavior if needed

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
- `hubble_ui_url`
- `keycloak_url`
- `oauth2_proxy_url`
- `observability_demo_username`

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
