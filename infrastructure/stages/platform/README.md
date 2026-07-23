# Platform Terraform Stage

The `platform` stage owns the shared in-cluster layer that sits on top of an existing EKS cluster.

## Ownership Boundary

This stage owns:

- Cilium, Hubble, Tetragon, Kyverno, and optional `ingress-nginx`
- the `isolens-system` namespace
- backend, frontend, runner, and Keycloak workloads
- the control-plane PostgreSQL RDS instance

This stage does not own:

- ward application workloads
- ward-specific Services, exposures, and workload policies
- policy CR instances from the `policies` stage

## Authentication Architecture

The platform stage now deploys:

- in-cluster Keycloak under the control-plane namespace
- frontend reverse-proxy access for `/auth`
- backend OIDC configuration pointing to the internal Keycloak service
- a generated bootstrap admin password

Identity is handled by Keycloak. The backend still owns:

- control-plane sessions
- authorization checks
- audit logging

The platform stage does not bootstrap the Keycloak realm, client, or users. It only brings up the service cleanly so you can configure identity afterwards.

## Database Layout

This stage provisions one private RDS PostgreSQL instance and uses it for two logical databases:

1. the control-plane backend database
2. the Keycloak database

The instance is private, SG-restricted to the EKS worker-node security group, and both database users use generated passwords stored in Terraform state.

## Direct Terraform Usage

```bash
cd infrastructure/stages/platform
terraform init -reconfigure -backend-config=backend.hcl
terraform validate
terraform plan
terraform apply
```

## Important Inputs

- `cluster_admin_principal_arns`
- `control_plane_public_app_url`
- `control_plane_session_cookie_secure`
- `control_plane_backend_*`
- `control_plane_frontend_*`
- `control_plane_runner_*`
- `postgresql_*`
- `keycloak_*`

## Important Outputs

- `control_plane_namespace`
- `control_plane_backend_service_name`
- `control_plane_backend_service_fqdn`
- `control_plane_frontend_service_name`
- `control_plane_runner_name`
- `control_plane_keycloak_service_name`
- `control_plane_keycloak_service_fqdn`
- `postgresql_endpoint`
- `postgresql_database_name`
- `postgresql_username`
- `keycloak_database_name`
- `keycloak_database_username`
- `keycloak_realm`

## Validation

After apply:

```bash
kubectl -n kube-system get pods -l k8s-app=cilium
```

```bash
kubectl -n kube-system get deploy coredns
```

```bash
kubectl -n isolens-system get deploy,po,svc,statefulset
```

```bash
kubectl -n isolens-system logs statefulset/isolens-keycloak
```

```bash
kubectl -n isolens-system exec deploy/isolens-backend -- printenv | grep '^ISOLENS_OIDC_'
```

After Keycloak is healthy, configure:

- the realm named by `keycloak_realm`
- the client named by `keycloak_client_id`
- redirect URI `${control_plane_public_app_url}/auth/callback`
- web origin `control_plane_public_app_url`
- a public PKCE client if `keycloak_client_secret` is empty, or a confidential client if you set a secret explicitly

```bash
aws rds describe-db-instances --db-instance-identifier isolens-postgresql
```

Expected results:

- Cilium agents are ready
- CoreDNS is available
- backend, frontend, runner, and Keycloak are healthy in `isolens-system`
- the shared RDS instance is available

## Hubble

Hubble access remains internal:

```bash
kubectl -n kube-system port-forward svc/hubble-ui 12000:80
```

Then open:

```text
http://127.0.0.1:12000
```

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| terraform | >= 1.7.0 |
| aws | 5.100.0 |
| helm | 2.17.0 |
| kubernetes | 2.37.1 |
| random | 3.7.2 |
| time | 0.13.1 |

## Modules

| Name | Source | Version |
| ---- | ------ | ------- |
| addons | ../../modules/platform-addons | n/a |
| control_plane | ../../modules/control-plane | n/a |
| postgresql | ../../modules/platform-postgresql | n/a |

## Resources

| Name | Type |
| ---- | ---- |
| [aws_iam_policy.cilium_operator](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/iam_policy) | resource |
| [aws_iam_role.cilium_operator](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/iam_role) | resource |
| [aws_iam_role_policy_attachment.cilium_operator](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/iam_role_policy_attachment) | resource |
| [kubernetes_namespace_v1.control_plane](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/namespace_v1) | resource |
| [random_password.keycloak_admin_password](https://registry.terraform.io/providers/hashicorp/random/3.7.2/docs/resources/password) | resource |
| [random_password.keycloak_database_password](https://registry.terraform.io/providers/hashicorp/random/3.7.2/docs/resources/password) | resource |
| [random_password.postgresql_password](https://registry.terraform.io/providers/hashicorp/random/3.7.2/docs/resources/password) | resource |
| [time_sleep.cluster_access_ready](https://registry.terraform.io/providers/hashicorp/time/0.13.1/docs/resources/sleep) | resource |
| [aws_eks_cluster.this](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/data-sources/eks_cluster) | data source |
| [aws_iam_openid_connect_provider.this](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/data-sources/iam_openid_connect_provider) | data source |
| [aws_iam_policy_document.cilium_operator](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/data-sources/iam_policy_document) | data source |
| [aws_iam_policy_document.cilium_operator_assume_role](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/data-sources/iam_policy_document) | data source |
| [aws_security_group.eks_nodes](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/data-sources/security_group) | data source |
| [aws_vpc.cluster](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/data-sources/vpc) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| cluster_admin_principal_arns | IAM principal ARNs granted cluster-admin access in the core stage. Used here to keep the post-core readiness wait tied to access configuration changes. | `list(string)` | `[]` | no |
| cluster_name | Name of the existing EKS cluster targeted by the platform stage. | `string` | `"forensic-lab"` | no |
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
| control_plane_public_app_url | Public base URL of the control-plane frontend, used for Keycloak redirects and issuer URLs. | `string` | `"http://localhost:5173"` | no |
| control_plane_runner_name | Deployment name for the control-plane Terraform runner. | `string` | `"isolens-runner"` | no |
| control_plane_runner_replicas | Replica count for the control-plane Terraform runner. | `number` | `1` | no |
| control_plane_runner_resources | Resource requests and limits for the control-plane Terraform runner container. | <pre>object({<br/>    requests_cpu    = string<br/>    requests_memory = string<br/>    limits_cpu      = string<br/>    limits_memory   = string<br/>  })</pre> | <pre>{<br/>  "limits_cpu": "1000m",<br/>  "limits_memory": "1Gi",<br/>  "requests_cpu": "250m",<br/>  "requests_memory": "512Mi"<br/>}</pre> | no |
| control_plane_session_cookie_secure | Whether the backend session cookie should require HTTPS. | `bool` | `true` | no |
| enable_ingress_nginx | Whether the shared nginx ingress controller should be installed by the platform layer. | `bool` | `false` | no |
| environment | Environment name used for tags and naming. | `string` | `"lab"` | no |
| keycloak_client_id | OIDC client identifier used by the Isolens control plane. | `string` | `"isolens-web"` | no |
| keycloak_client_secret | Optional OIDC client secret used by the Isolens control plane. Leave empty for a public PKCE client. | `string` | `""` | no |
| keycloak_database_name | Database name created for Keycloak on the shared PostgreSQL instance. | `string` | `"keycloak"` | no |
| keycloak_database_username | Database username created for Keycloak on the shared PostgreSQL instance. | `string` | `"keycloak"` | no |
| keycloak_image | Container image for the in-cluster Keycloak deployment. | `string` | `"quay.io/keycloak/keycloak:26.6.4"` | no |
| keycloak_image_pull_policy | Image pull policy for the Keycloak container. | `string` | `"IfNotPresent"` | no |
| keycloak_name | Service and StatefulSet name for the control-plane Keycloak deployment. | `string` | `"isolens-keycloak"` | no |
| keycloak_realm | Keycloak realm used by the Isolens control plane. | `string` | `"isolens"` | no |
| kubernetes_version | Cluster Kubernetes version used to label shared namespaces with the matching PSA version. | `string` | `"1.35"` | no |
| postgresql_allocated_storage | Allocated storage in GiB for PostgreSQL. | `number` | `20` | no |
| postgresql_apply_immediately | Whether PostgreSQL modifications should be applied immediately. | `bool` | `true` | no |
| postgresql_backup_retention_period | Number of days to retain automated backups. | `number` | `7` | no |
| postgresql_backup_window | Preferred daily backup window in UTC. | `string` | `"03:00-04:00"` | no |
| postgresql_database_name | Database name created for the control plane. | `string` | `"isolens"` | no |
| postgresql_deletion_protection | Whether to enable deletion protection on PostgreSQL. | `bool` | `false` | no |
| postgresql_engine_version | PostgreSQL engine version. Null lets AWS choose the default version for the selected engine family. | `string` | `null` | no |
| postgresql_instance_class | RDS instance class for the control-plane PostgreSQL database. | `string` | `"db.t3.medium"` | no |
| postgresql_maintenance_window | Preferred weekly maintenance window in UTC. | `string` | `"sun:04:30-sun:05:30"` | no |
| postgresql_max_allocated_storage | Upper limit in GiB for PostgreSQL storage autoscaling. | `number` | `100` | no |
| postgresql_multi_az | Whether to provision a Multi-AZ standby for PostgreSQL. | `bool` | `true` | no |
| postgresql_name | Base name used for the RDS PostgreSQL resources. | `string` | `"isolens-postgresql"` | no |
| postgresql_port | Port exposed by PostgreSQL. | `number` | `5432` | no |
| postgresql_skip_final_snapshot | Whether to skip the final snapshot when destroying PostgreSQL. | `bool` | `true` | no |
| postgresql_storage_encrypted | Whether to enable storage encryption for PostgreSQL. | `bool` | `true` | no |
| postgresql_storage_type | RDS storage type. | `string` | `"gp3"` | no |
| postgresql_username | Application username created for the control plane database. | `string` | `"isolens"` | no |
| project_name | Logical project name used for tagging and naming. | `string` | `"isolens"` | no |
| region | AWS region of the existing EKS cluster targeted by the platform stage. | `string` | `"eu-north-1"` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| control_plane_backend_service_fqdn | Cluster-local DNS name for the control-plane backend service. |
| control_plane_backend_service_name | ClusterIP Service name for the control-plane backend. |
| control_plane_frontend_service_name | Service name for the control-plane frontend. |
| control_plane_keycloak_service_fqdn | Cluster-local DNS name for the control-plane Keycloak service. |
| control_plane_keycloak_service_name | ClusterIP Service name for the control-plane Keycloak workload. |
| control_plane_namespace | Namespace reserved for the Isolens backend and frontend workloads. |
| control_plane_runner_name | Deployment name for the control-plane Terraform runner. |
| ingress_controller_namespace | Namespace containing the nginx ingress controller when nginx-backed ingresses are enabled. |
| keycloak_database_name | Database name provisioned for Keycloak on the shared PostgreSQL instance. |
| keycloak_database_username | Database username provisioned for Keycloak on the shared PostgreSQL instance. |
| keycloak_realm | Keycloak realm used by the Isolens control plane. |
| kyverno_namespace | Namespace containing the Kyverno policy engine. |
| postgresql_address | DNS address of the RDS PostgreSQL instance used by the control plane. |
| postgresql_database_name | Database name provisioned for the control plane. |
| postgresql_endpoint | Endpoint of the RDS PostgreSQL instance used by the control plane. |
| postgresql_port | Port exposed by the RDS PostgreSQL instance. |
| postgresql_username | Application username provisioned for the control plane database. |
| update_kubeconfig_command | Command to merge this cluster into the local kubeconfig. |
<!-- END_TF_DOCS -->
