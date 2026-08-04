# Control Plane Module

This module deploys the shared Isolens control-plane workloads into `isolens-system`.

## What It Creates

- backend Deployment, Service, and runtime secret
- frontend Deployment and Service
- runner Deployment
- Keycloak Service, StatefulSet, and runtime secret
- Keycloak database bootstrap Secret and Job for creating the Keycloak database/user on the shared PostgreSQL instance
- optional Keycloak realm bootstrap Secret, ConfigMap, and Job for the Isolens realm/client setup
- optional namespace creation for the control-plane namespace

## Authentication Model

The backend runtime secret now carries:

- `ISOLENS_DATABASE_URL`
- `ISOLENS_OIDC_INTERNAL_BASE_URL`
- `ISOLENS_OIDC_REALM`
- `ISOLENS_OIDC_CLIENT_ID`
- `ISOLENS_OIDC_CLIENT_SECRET`
- `ISOLENS_SESSION_COOKIE_SECURE`

The frontend runtime now proxies:

- `/api` -> backend
- `/auth` -> Keycloak

Before Keycloak starts, the module runs a short bootstrap Job that creates the Keycloak database and role inside the shared PostgreSQL instance if they do not already exist.
By default, the module also runs a one-time realm bootstrap Job that creates the configured Isolens realm and OIDC client.
Ongoing user, group, and role management remains a Keycloak administration concern after bootstrap.

## Key Inputs

Backend:

- `backend_image`
- `backend_database_url`
- `public_app_url`
- `session_cookie_secure`

Frontend:

- `frontend_image`
- `frontend_service_name`

Keycloak:

- `keycloak_name`
- `keycloak_image`
- `keycloak_realm`
- `keycloak_client_id`
- `keycloak_client_secret`
- `keycloak_admin_password`
- `keycloak_database_*`

## Key Outputs

- `namespace`
- `backend_service_name`
- `backend_service_fqdn`
- `frontend_service_name`
- `runner_name`
- `keycloak_service_name`
- `keycloak_service_fqdn`

## Validation

After apply:

```bash
kubectl -n isolens-system get deploy,po,svc,statefulset
```

```bash
kubectl -n isolens-system logs statefulset/isolens-keycloak
```

```bash
kubectl -n isolens-system exec deploy/isolens-backend -- printenv | grep '^ISOLENS_OIDC_'
```

```bash
kubectl -n isolens-system logs job/isolens-keycloak-realm-bootstrap
```

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
| [kubernetes_config_map_v1.keycloak_database_bootstrap_script](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/config_map_v1) | resource |
| [kubernetes_config_map_v1.keycloak_realm_bootstrap_script](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/config_map_v1) | resource |
| [kubernetes_config_map_v1.keycloak_theme](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/config_map_v1) | resource |
| [kubernetes_deployment_v1.backend](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/deployment_v1) | resource |
| [kubernetes_deployment_v1.frontend](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/deployment_v1) | resource |
| [kubernetes_deployment_v1.runner](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/deployment_v1) | resource |
| [kubernetes_job_v1.keycloak_database_bootstrap](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/job_v1) | resource |
| [kubernetes_job_v1.keycloak_realm_bootstrap](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/job_v1) | resource |
| [kubernetes_namespace_v1.control_plane](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/namespace_v1) | resource |
| [kubernetes_secret_v1.backend_runtime](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/secret_v1) | resource |
| [kubernetes_secret_v1.keycloak_database_bootstrap](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/secret_v1) | resource |
| [kubernetes_secret_v1.keycloak_realm_bootstrap](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/secret_v1) | resource |
| [kubernetes_secret_v1.keycloak_runtime](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/secret_v1) | resource |
| [kubernetes_service_v1.backend](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/service_v1) | resource |
| [kubernetes_service_v1.frontend](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/service_v1) | resource |
| [kubernetes_service_v1.keycloak](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/service_v1) | resource |
| [kubernetes_stateful_set_v1.keycloak](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/stateful_set_v1) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| annotations | Additional annotations applied to the control-plane namespace. | `map(string)` | `{}` | no |
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
| keycloak_admin_password | Bootstrap Keycloak admin password. | `string` | n/a | yes |
| keycloak_admin_username | Bootstrap Keycloak admin username. | `string` | `"admin"` | no |
| keycloak_bootstrap_realm | Whether the control-plane module should bootstrap the Keycloak realm and client configuration. | `bool` | `true` | no |
| keycloak_client_id | OIDC client identifier used by the Isolens control plane. | `string` | `"isolens-web"` | no |
| keycloak_client_secret | OIDC client secret used by the Isolens control plane. | `string` | `""` | no |
| keycloak_container_port | Container port exposed by the Keycloak workload. | `number` | `8080` | no |
| keycloak_database_admin_database | Administrative PostgreSQL database used to bootstrap the Keycloak database and role. | `string` | n/a | yes |
| keycloak_database_admin_password | Administrative PostgreSQL password used to bootstrap the Keycloak database and role. | `string` | n/a | yes |
| keycloak_database_admin_username | Administrative PostgreSQL username used to bootstrap the Keycloak database and role. | `string` | n/a | yes |
| keycloak_database_bootstrap_resources | Resource requests and limits for the one-time Keycloak database bootstrap job. | <pre>object({<br/>    requests_cpu    = string<br/>    requests_memory = string<br/>    limits_cpu      = string<br/>    limits_memory   = string<br/>  })</pre> | <pre>{<br/>  "limits_cpu": "250m",<br/>  "limits_memory": "256Mi",<br/>  "requests_cpu": "50m",<br/>  "requests_memory": "128Mi"<br/>}</pre> | no |
| keycloak_database_host | Hostname of the PostgreSQL instance used by Keycloak. | `string` | n/a | yes |
| keycloak_database_name | Database name used by Keycloak. | `string` | n/a | yes |
| keycloak_database_password | Database password used by Keycloak. | `string` | n/a | yes |
| keycloak_database_port | Port of the PostgreSQL instance used by Keycloak. | `number` | `5432` | no |
| keycloak_database_username | Database username used by Keycloak. | `string` | n/a | yes |
| keycloak_image | Container image for the in-cluster Keycloak deployment. | `string` | `"quay.io/keycloak/keycloak:26.6.4"` | no |
| keycloak_image_pull_policy | Image pull policy for the Keycloak container. | `string` | `"IfNotPresent"` | no |
| keycloak_name | Service and StatefulSet name for the in-cluster Keycloak deployment. | `string` | `"isolens-keycloak"` | no |
| keycloak_realm | Keycloak realm used by the Isolens control plane. | `string` | `"isolens"` | no |
| keycloak_realm_bootstrap_resources | Resource requests and limits for the one-time Keycloak realm bootstrap job. | <pre>object({<br/>    requests_cpu    = string<br/>    requests_memory = string<br/>    limits_cpu      = string<br/>    limits_memory   = string<br/>  })</pre> | <pre>{<br/>  "limits_cpu": "250m",<br/>  "limits_memory": "256Mi",<br/>  "requests_cpu": "50m",<br/>  "requests_memory": "128Mi"<br/>}</pre> | no |
| keycloak_resources | Resource requests and limits for the Keycloak container. | <pre>object({<br/>    requests_cpu    = string<br/>    requests_memory = string<br/>    limits_cpu      = string<br/>    limits_memory   = string<br/>  })</pre> | <pre>{<br/>  "limits_cpu": "1000m",<br/>  "limits_memory": "1Gi",<br/>  "requests_cpu": "250m",<br/>  "requests_memory": "512Mi"<br/>}</pre> | no |
| keycloak_service_port | Service port exposed by the Keycloak service. | `number` | `8080` | no |
| kubernetes_version | Cluster Kubernetes version used to label the namespace with the matching PSA version. | `string` | n/a | yes |
| labels | Additional labels applied to the control-plane namespace. | `map(string)` | `{}` | no |
| namespace | Namespace used for the Isolens control-plane workloads. | `string` | n/a | yes |
| public_app_url | Public base URL used by the frontend and Keycloak redirect flow. | `string` | n/a | yes |
| runner_name | Deployment name for the Terraform runner workload. | `string` | `"isolens-runner"` | no |
| runner_replicas | Replica count for the Terraform runner workload. | `number` | `2` | no |
| runner_resources | Resource requests and limits for the Terraform runner container. | <pre>object({<br/>    requests_cpu    = string<br/>    requests_memory = string<br/>    limits_cpu      = string<br/>    limits_memory   = string<br/>  })</pre> | <pre>{<br/>  "limits_cpu": "1000m",<br/>  "limits_memory": "1Gi",<br/>  "requests_cpu": "250m",<br/>  "requests_memory": "512Mi"<br/>}</pre> | no |
| session_cookie_secure | Whether the backend session cookie should require HTTPS. | `bool` | `true` | no |
| session_ttl_seconds | Maximum lifetime of a control-plane session in seconds. | `number` | `7200` | no |
| terraform_variable_set | Committed Terraform variable-set directory name consumed by the backend and runner. | `string` | `"lab"` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| backend_service_fqdn | Cluster-local DNS name for the control-plane backend service. |
| backend_service_name | ClusterIP Service name for the control-plane backend. |
| frontend_service_name | Service name for the control-plane frontend. |
| keycloak_admin_username | Bootstrap Keycloak admin username. |
| keycloak_service_fqdn | Cluster-local DNS name for the control-plane Keycloak service. |
| keycloak_service_name | ClusterIP Service name for the control-plane Keycloak workload. |
| namespace | Namespace reserved for the Isolens backend and frontend workloads. |
| runner_name | Deployment name for the Terraform runner workload. |
<!-- END_TF_DOCS -->
