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

### Control-plane resources

Platform also creates:

- a dedicated namespace for the Isolens backend and frontend
- an in-cluster PostgreSQL StatefulSet, Service, Secret, PVC, and namespace-local NetworkPolicy
- the Kyverno and Tetragon manifest layer after the add-ons and subject namespaces are ready

## Prerequisites

This stage expects:

- the `core` stage to have been applied successfully
- the EKS cluster to be reachable
- at least one configured cluster-admin IAM principal to already have access through the core stage

## Cilium Bootstrap Notes

- The current platform design uses the Cilium-supported AWS VPC CNI chaining mode on EKS rather than Cilium ENI IPAM mode.
- This keeps the EKS `aws-node` daemonset responsible for pod IP allocation and baseline node networking while still letting Cilium provide policy enforcement, Hubble, and the foundation for Tetragon.
- Policy creation waits for the add-on layer, ward namespaces, and control-plane services so in-cluster dependencies are applied in a safe order.

## Inputs

This stage actively uses:

- `project_name`
- `environment`
- `region`
- `cluster_name`
- `kubernetes_version`
- `cluster_admin_principal_arns`
- `analysis_subjects`
- `control_plane_namespace`
- `postgresql_*`

## Outputs

Current outputs include:

- `ward_namespaces`
- `monitoring_namespace`
- `monitoring_release_name`
- `kyverno_namespace`
- `update_kubeconfig_command`
- `ingress_controller_namespace`
- `control_plane_namespace`
- `postgresql_service_fqdn`
- `postgresql_secret_name`
- `postgresql_database_name`
- `postgresql_username`
- `kyverno_cluster_policies`
- `tetragon_policy_namespaces`

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
| control_plane | ../modules/control-plane | n/a |
| policy_manifests | ../modules/policies-stack | n/a |
| postgresql | ../modules/platform-postgresql | n/a |
| subjects | ../modules/ward-subjects | n/a |

## Resources

| Name | Type |
| ---- | ---- |
| [time_sleep.cluster_access_ready](https://registry.terraform.io/providers/hashicorp/time/0.13.1/docs/resources/sleep) | resource |
| [time_sleep.platform_services_ready](https://registry.terraform.io/providers/hashicorp/time/0.13.1/docs/resources/sleep) | resource |
| [aws_eks_cluster.this](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/data-sources/eks_cluster) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| analysis_subjects | Ward namespace definitions. Each entry creates a namespace, ward metadata ConfigMap, ResourceQuota, LimitRange, and baseline NetworkPolicies. | <pre>map(object({<br/>    tier        = string<br/>    description = string<br/>    labels      = optional(map(string), {})<br/>    annotations = optional(map(string), {})<br/>    resource_quota = optional(object({<br/>      pods            = optional(string, "10")<br/>      requests_cpu    = optional(string, "2")<br/>      requests_memory = optional(string, "4Gi")<br/>      limits_cpu      = optional(string, "4")<br/>      limits_memory   = optional(string, "8Gi")<br/>    }), {})<br/>  }))</pre> | n/a | yes |
| cluster_admin_principal_arns | IAM principal ARNs granted cluster-admin access in the core stage. Used here to keep the post-core readiness wait tied to access configuration changes. | `list(string)` | `[]` | no |
| cluster_name | Name of the existing EKS cluster targeted by the platform stage. | `string` | `"forensic-lab"` | no |
| control_plane_backend_api_token | Bearer token required by the control-plane backend API. | `string` | `"dev-token"` | no |
| control_plane_backend_container_port | Container port for the control-plane backend workload. | `number` | `8000` | no |
| control_plane_backend_image | Container image for the control-plane backend workload. | `string` | `"401262697743.dkr.ecr.eu-north-1.amazonaws.com/isolens-backend:latest"` | no |
| control_plane_backend_image_pull_policy | Image pull policy for the control-plane backend workload. | `string` | `"IfNotPresent"` | no |
| control_plane_backend_replicas | Replica count for the control-plane backend workload. | `number` | `1` | no |
| control_plane_backend_resources | Resource requests and limits for the control-plane backend container. | <pre>object({<br/>    requests_cpu    = string<br/>    requests_memory = string<br/>    limits_cpu      = string<br/>    limits_memory   = string<br/>  })</pre> | <pre>{<br/>  "limits_cpu": "1000m",<br/>  "limits_memory": "1Gi",<br/>  "requests_cpu": "250m",<br/>  "requests_memory": "512Mi"<br/>}</pre> | no |
| control_plane_backend_service_name | Service name for the control-plane backend workload. | `string` | `"isolens-backend"` | no |
| control_plane_backend_service_port | Service port for the control-plane backend workload. | `number` | `8000` | no |
| control_plane_frontend_container_port | Container port for the control-plane frontend workload. | `number` | `8080` | no |
| control_plane_frontend_image | Container image for the control-plane frontend workload. | `string` | `"401262697743.dkr.ecr.eu-north-1.amazonaws.com/isolens-frontend:latest"` | no |
| control_plane_frontend_image_pull_policy | Image pull policy for the control-plane frontend workload. | `string` | `"IfNotPresent"` | no |
| control_plane_frontend_replicas | Replica count for the control-plane frontend workload. | `number` | `1` | no |
| control_plane_frontend_resources | Resource requests and limits for the control-plane frontend container. | <pre>object({<br/>    requests_cpu    = string<br/>    requests_memory = string<br/>    limits_cpu      = string<br/>    limits_memory   = string<br/>  })</pre> | <pre>{<br/>  "limits_cpu": "500m",<br/>  "limits_memory": "256Mi",<br/>  "requests_cpu": "100m",<br/>  "requests_memory": "128Mi"<br/>}</pre> | no |
| control_plane_frontend_service_name | Service name for the control-plane frontend workload. | `string` | `"isolens-frontend"` | no |
| control_plane_frontend_service_port | Service port for the control-plane frontend workload. | `number` | `80` | no |
| control_plane_namespace | Namespace reserved for the Isolens backend and frontend workloads. | `string` | `"isolens-system"` | no |
| control_plane_namespace_annotations | Additional annotations applied to the control-plane namespace. | `map(string)` | `{}` | no |
| control_plane_namespace_labels | Additional labels applied to the control-plane namespace. | `map(string)` | `{}` | no |
| enable_ingress_nginx | Whether the shared nginx ingress controller should be installed by the platform layer. | `bool` | `false` | no |
| environment | Environment name used for tags and naming. | `string` | `"lab"` | no |
| kubernetes_version | Cluster Kubernetes version used to label namespaces with the matching PSA version. | `string` | `"1.35"` | no |
| postgresql_database_name | Database name created for the control plane. | `string` | `"isolens"` | no |
| postgresql_image | Container image used for the control-plane PostgreSQL workload. | `string` | `"postgres:16.9-alpine"` | no |
| postgresql_name | Base name used for PostgreSQL resources in the control-plane namespace. | `string` | `"isolens-postgresql"` | no |
| postgresql_password | Application password stored in the PostgreSQL Secret. | `string` | `"isolens-dev-password-change-me"` | no |
| postgresql_resources | Resource requests and limits for the PostgreSQL container. | <pre>object({<br/>    requests_cpu    = string<br/>    requests_memory = string<br/>    limits_cpu      = string<br/>    limits_memory   = string<br/>  })</pre> | <pre>{<br/>  "limits_cpu": "1000m",<br/>  "limits_memory": "1Gi",<br/>  "requests_cpu": "250m",<br/>  "requests_memory": "512Mi"<br/>}</pre> | no |
| postgresql_service_port | Service port exposed by PostgreSQL. | `number` | `5432` | no |
| postgresql_storage_class_name | Optional storage class name for the PostgreSQL persistent volume claim. | `string` | `null` | no |
| postgresql_storage_size | Persistent volume size for the control-plane PostgreSQL data. | `string` | `"20Gi"` | no |
| postgresql_username | Application username created for the control plane database. | `string` | `"isolens"` | no |
| project_name | Logical project name used for tagging and naming. | `string` | `"isolens"` | no |
| region | AWS region of the existing EKS cluster targeted by the platform stage. | `string` | `"eu-north-1"` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| control_plane_backend_service_fqdn | Cluster-local DNS name for the control-plane backend service. |
| control_plane_backend_service_name | ClusterIP Service name for the control-plane backend. |
| control_plane_frontend_service_name | Service name for the control-plane frontend. |
| control_plane_namespace | Namespace reserved for the Isolens backend and frontend workloads. |
| ingress_controller_namespace | Namespace containing the nginx ingress controller when nginx-backed ingresses are enabled. |
| kyverno_cluster_policies | Kyverno ClusterPolicy objects managed by the platform stage. |
| kyverno_namespace | Namespace containing the Kyverno policy engine. |
| monitoring_namespace | Namespace containing the observability stack. |
| monitoring_release_name | Helm release name used for the monitoring agent stack. |
| postgresql_database_name | Database name provisioned for the control plane. |
| postgresql_secret_name | Secret containing the PostgreSQL connection credentials. |
| postgresql_service_fqdn | Cluster-local DNS name for the PostgreSQL service used by the control plane. |
| postgresql_username | Application username provisioned for the control plane database. |
| tetragon_policy_namespaces | Namespaces that receive Tetragon tracing policies. |
| update_kubeconfig_command | Command to merge this cluster into the local kubeconfig. |
| ward_namespaces | Ward namespaces created for analysis subjects. |
<!-- END_TF_DOCS -->
