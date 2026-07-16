# Control Plane Module

Creates the namespace reserved for the Isolens control-plane workloads.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| terraform | >= 1.7.0 |
| kubernetes | 2.37.1 |

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [kubernetes_deployment_v1.backend](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/deployment_v1) | resource |
| [kubernetes_deployment_v1.frontend](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/deployment_v1) | resource |
| [kubernetes_deployment_v1.runner](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/deployment_v1) | resource |
| [kubernetes_namespace_v1.control_plane](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/namespace_v1) | resource |
| [kubernetes_secret_v1.backend_runtime](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/secret_v1) | resource |
| [kubernetes_service_v1.backend](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/service_v1) | resource |
| [kubernetes_service_v1.frontend](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/service_v1) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| annotations | Additional annotations applied to the control-plane namespace. | `map(string)` | `{}` | no |
| backend_api_token | Bearer token required by the backend API. | `string` | n/a | yes |
| backend_container_port | Container port exposed by the backend workload. | `number` | `8000` | no |
| backend_database_url | PostgreSQL connection string used by the backend workload. | `string` | n/a | yes |
| backend_image | Container image for the Isolens backend workload. | `string` | n/a | yes |
| backend_image_pull_policy | Image pull policy for the backend container. | `string` | `"IfNotPresent"` | no |
| backend_replicas | Replica count for the backend workload. | `number` | `1` | no |
| backend_resources | Resource requests and limits for the backend container. | <pre>object({<br/>    requests_cpu    = string<br/>    requests_memory = string<br/>    limits_cpu      = string<br/>    limits_memory   = string<br/>  })</pre> | <pre>{<br/>  "limits_cpu": "1000m",<br/>  "limits_memory": "1Gi",<br/>  "requests_cpu": "250m",<br/>  "requests_memory": "512Mi"<br/>}</pre> | no |
| backend_service_name | ClusterIP Service name for the backend workload. | `string` | `"isolens-backend"` | no |
| backend_service_port | Service port exposed by the backend ClusterIP Service. | `number` | `8000` | no |
| create_namespace | Whether the control-plane module should create the namespace before deploying workloads. | `bool` | `true` | no |
| frontend_container_port | Container port exposed by the frontend workload. | `number` | `8080` | no |
| frontend_image | Container image for the Isolens frontend workload. | `string` | n/a | yes |
| frontend_image_pull_policy | Image pull policy for the frontend container. | `string` | `"IfNotPresent"` | no |
| frontend_replicas | Replica count for the frontend workload. | `number` | `1` | no |
| frontend_resources | Resource requests and limits for the frontend container. | <pre>object({<br/>    requests_cpu    = string<br/>    requests_memory = string<br/>    limits_cpu      = string<br/>    limits_memory   = string<br/>  })</pre> | <pre>{<br/>  "limits_cpu": "500m",<br/>  "limits_memory": "256Mi",<br/>  "requests_cpu": "100m",<br/>  "requests_memory": "128Mi"<br/>}</pre> | no |
| frontend_service_name | Service name for the frontend workload. | `string` | `"isolens-frontend"` | no |
| frontend_service_port | Service port exposed by the frontend Service. | `number` | `80` | no |
| kubernetes_version | Cluster Kubernetes version used to label the namespace with the matching PSA version. | `string` | n/a | yes |
| labels | Additional labels applied to the control-plane namespace. | `map(string)` | `{}` | no |
| namespace | Namespace used for the Isolens control-plane workloads. | `string` | n/a | yes |
| runner_name | Deployment name for the Terraform runner workload. | `string` | `"isolens-runner"` | no |
| runner_replicas | Replica count for the Terraform runner workload. | `number` | `2` | no |
| runner_resources | Resource requests and limits for the Terraform runner container. | <pre>object({<br/>    requests_cpu    = string<br/>    requests_memory = string<br/>    limits_cpu      = string<br/>    limits_memory   = string<br/>  })</pre> | <pre>{<br/>  "limits_cpu": "1000m",<br/>  "limits_memory": "1Gi",<br/>  "requests_cpu": "250m",<br/>  "requests_memory": "512Mi"<br/>}</pre> | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| backend_service_fqdn | Cluster-local DNS name for the control-plane backend service. |
| backend_service_name | ClusterIP Service name for the control-plane backend. |
| frontend_service_name | Service name for the control-plane frontend. |
| namespace | Namespace reserved for the Isolens backend and frontend workloads. |
| runner_name | Deployment name for the Terraform runner workload. |
<!-- END_TF_DOCS -->
