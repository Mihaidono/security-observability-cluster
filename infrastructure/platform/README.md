# Platform Terraform Stage

The `platform` stage owns everything that runs inside the already-created EKS cluster.

## What This Stage Creates

### Platform add-ons

- Cilium with Hubble enabled, chained on top of the AWS VPC CNI plugin
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

The frontend can now populate `ward_applications` in two different ways:

- standalone app templates
- scenario bundles that replace a ward's current applications with a curated proof case

Terraform does not know about those UI concepts directly. It only receives the resulting `ward_applications` list and provisions the corresponding Kubernetes resources.

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

Those outputs are most useful for:

- checking the service and ingress DNS names Terraform created
- copying ready-made `kubectl` inspection commands
- updating local kubeconfig for Hubble access and workload debugging

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

## Current Hubble Access Model

Hubble is currently intended to be used internally through the cluster API path, not through a public ingress. The normal operator flow is:

```bash
kubectl -n kube-system port-forward svc/hubble-ui 12000:80
```

and then:

```text
http://127.0.0.1:12000
```

## Terraform Reference

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| terraform | >= 1.7.0 |
| aws | 5.100.0 |
| helm | 2.17.0 |
| kubernetes | 2.37.1 |
| time | 0.13.1 |

## Modules

| Name | Source | Version |
| ---- | ------ | ------- |
| addons | ../modules/platform-addons | n/a |
| subjects | ../modules/ward-subjects | n/a |

## Resources

| Name | Type |
| ---- | ---- |
| [time_sleep.cluster_access_ready](https://registry.terraform.io/providers/hashicorp/time/0.13.1/docs/resources/sleep) | resource |
| [aws_eks_cluster.this](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/data-sources/eks_cluster) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| analysis_subjects | Ward namespace definitions. Each entry creates a namespace, ward metadata ConfigMap, ResourceQuota, LimitRange, and baseline NetworkPolicies. | <pre>map(object({<br/>    tier        = string<br/>    description = string<br/>    labels      = optional(map(string), {})<br/>    annotations = optional(map(string), {})<br/>    resource_quota = optional(object({<br/>      pods            = optional(string, "10")<br/>      requests_cpu    = optional(string, "2")<br/>      requests_memory = optional(string, "4Gi")<br/>      limits_cpu      = optional(string, "4")<br/>      limits_memory   = optional(string, "8Gi")<br/>    }), {})<br/>  }))</pre> | n/a | yes |
| cluster_admin_principal_arns | IAM principal ARNs granted cluster-admin access in the core stage. Used here to keep the post-core readiness wait tied to access configuration changes. | `list(string)` | `[]` | no |
| cluster_log_retention_in_days | Accepted for compatibility with the shared tfvars payload. | `number` | `90` | no |
| cluster_name | Name of the existing EKS cluster targeted by the platform stage. | `string` | `"forensic-lab"` | no |
| enable_ingress_nginx | Whether the shared nginx ingress controller should be installed by the platform layer. | `bool` | `false` | no |
| environment | Environment name used for tags and naming. | `string` | `"lab"` | no |
| kubernetes_version | Cluster Kubernetes version used to label namespaces with the matching PSA version. | `string` | `"1.35"` | no |
| node_group_scaling | Accepted for compatibility with the shared tfvars payload. | <pre>object({<br/>    min_size     = number<br/>    max_size     = number<br/>    desired_size = number<br/>  })</pre> | <pre>{<br/>  "desired_size": 2,<br/>  "max_size": 5,<br/>  "min_size": 2<br/>}</pre> | no |
| node_instance_types | Accepted for compatibility with the shared tfvars payload. | `list(string)` | <pre>[<br/>  "t3.xlarge"<br/>]</pre> | no |
| private_subnets | Accepted for compatibility with the shared tfvars payload. | `list(string)` | <pre>[<br/>  "10.0.1.0/24",<br/>  "10.0.2.0/24"<br/>]</pre> | no |
| project_name | Logical project name used for tagging and naming. | `string` | `"isolens"` | no |
| public_subnets | Accepted for compatibility with the shared tfvars payload. | `list(string)` | <pre>[<br/>  "10.0.101.0/24",<br/>  "10.0.102.0/24"<br/>]</pre> | no |
| region | AWS region of the existing EKS cluster targeted by the platform stage. | `string` | `"eu-north-1"` | no |
| vpc_cidr | Accepted for compatibility with the shared tfvars payload. | `string` | `"10.0.0.0/16"` | no |
| ward_applications | Accepted for compatibility with the shared tfvars payload. Workloads moved to the applications root. | `any` | `[]` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| ingress_controller_namespace | Namespace containing the nginx ingress controller when nginx-backed ingresses are enabled. |
| kyverno_namespace | Namespace containing the Kyverno policy engine. |
| monitoring_namespace | Namespace containing the observability stack. |
| monitoring_release_name | Helm release name used for the monitoring agent stack. |
| update_kubeconfig_command | Command to merge this cluster into the local kubeconfig. |
| ward_namespaces | Ward namespaces created for analysis subjects. |
<!-- END_TF_DOCS -->
