# Platform PostgreSQL Module

Creates the PostgreSQL resources used by the Isolens control plane inside the platform stage.

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
| [kubernetes_network_policy.allow_same_namespace_ingress](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/network_policy) | resource |
| [kubernetes_secret_v1.credentials](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/secret_v1) | resource |
| [kubernetes_service_v1.postgresql](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/service_v1) | resource |
| [kubernetes_stateful_set_v1.postgresql](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/stateful_set_v1) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| database_name | Database name created by the PostgreSQL container. | `string` | `"isolens"` | no |
| image | Container image for PostgreSQL. | `string` | `"postgres:16.9-alpine"` | no |
| name | Base name used for PostgreSQL resources. | `string` | `"isolens-postgresql"` | no |
| namespace | Namespace where PostgreSQL will run. | `string` | n/a | yes |
| password | Application password stored in the PostgreSQL Secret. | `string` | `"isolens-dev-password-change-me"` | no |
| resources | Resource requests and limits for the PostgreSQL container. | <pre>object({<br/>    requests_cpu    = string<br/>    requests_memory = string<br/>    limits_cpu      = string<br/>    limits_memory   = string<br/>  })</pre> | <pre>{<br/>  "limits_cpu": "1000m",<br/>  "limits_memory": "1Gi",<br/>  "requests_cpu": "250m",<br/>  "requests_memory": "512Mi"<br/>}</pre> | no |
| service_port | Service port exposed by PostgreSQL. | `number` | `5432` | no |
| storage_class_name | Optional storage class name for the PostgreSQL volume claim. | `string` | `null` | no |
| storage_size | Persistent volume size for PostgreSQL data. | `string` | `"20Gi"` | no |
| username | Application username created by the PostgreSQL container. | `string` | `"isolens"` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| database_name | Application database name. |
| secret_name | Secret containing the PostgreSQL connection credentials. |
| service_fqdn | Cluster-local DNS name for the PostgreSQL service. |
| service_name | Kubernetes Service name used for PostgreSQL. |
| username | Application username for PostgreSQL. |
<!-- END_TF_DOCS -->
