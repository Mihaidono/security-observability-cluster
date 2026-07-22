# Platform Terraform Stage

The `platform` stage owns only the shared cluster resources that sit on top of an already-created EKS cluster.

## Ownership Boundary

This stage owns:

- shared networking and security add-ons
- shared policy and runtime components
- the Isolens control-plane namespace and workloads
- the private Amazon RDS for PostgreSQL instance used by the control plane

This stage does not own:

- ward namespaces for user scenarios
- application Deployments, Services, Ingresses, or per-ward network policies

Those application-scoped resources belong to the `applications` stage.

## What This Stage Creates

### Platform add-ons

- Cilium as the primary EKS networking datapath using AWS ENI IPAM
- Hubble for flow visibility
- CoreDNS EKS add-on after Cilium is ready enough to remove the node taint
- Tetragon
- Kyverno
- optional `ingress-nginx` only when explicitly enabled

### Control-plane resources

- `isolens-system` namespace
- backend Deployment and Service
- frontend Deployment and Service
- runner Deployment
- private Amazon RDS for PostgreSQL
- RDS subnet group and security group

## Prerequisites

This stage expects:

- the `core` stage to have been applied successfully
- the EKS cluster to be reachable
- at least one configured cluster-admin IAM principal to already have access through the core stage

## Operational Ownership

- This stage is infrastructure-owned and is no longer executable from the Isolens control-plane UI.
- The repository workflow [deploy-infrastructure.yml](/home/mihandrei/work/security-observability-cluster/.github/workflows/deploy-infrastructure.yml) always plans this stage after the core job and applies it only when Terraform reports a real platform change.
- When `core` changes, the same workflow still replans `platform` afterwards so shared services are checked against the updated foundation before any apply decision is made.

## Cilium Bootstrap Notes

- The platform now expects the `core` stage node group to be tainted with `node.cilium.io/agent-not-ready=true:NoExecute` before any application workloads are scheduled.
- The Cilium install uses AWS ENI IPAM and `kubeProxyReplacement=true` so Cilium becomes the primary Kubernetes networking layer on EKS instead of chaining on top of the AWS VPC CNI datapath.
- The EKS `aws-node` daemonset still exists because the `vpc-cni` add-on is installed, but it must be patched before the platform apply so it no longer schedules onto worker nodes.
- Platform bootstrap order is intentionally `Cilium -> CoreDNS -> remaining add-ons -> control-plane resources` to avoid the unschedulable CoreDNS deadlock caused by the node taint.
- Kyverno and Tetragon CRDs are installed here, while the custom policy resources themselves are applied later by the dedicated `policies` stage.

## Database Notes

- PostgreSQL is no longer scheduled inside the cluster.
- The control plane connects to a private RDS PostgreSQL instance using the endpoint exported by the PostgreSQL module.
- The backend connection string currently enforces TLS with `sslmode=require`.
- RDS ingress is restricted through a security group reference to the EKS worker-node security group, not by a broad VPC CIDR allow rule.
- This limits AWS-side access to traffic originating from worker-node ENIs. Pod-level restriction should still be enforced separately with Cilium policy.

## Inputs

This stage actively uses:

- `project_name`
- `environment`
- `region`
- `cluster_name`
- `kubernetes_version`
- `cluster_admin_principal_arns`
- `control_plane_namespace`
- `postgresql_*`

## Outputs

Current outputs include:

- `kyverno_namespace`
- `update_kubeconfig_command`
- `ingress_controller_namespace`
- `control_plane_namespace`
- `postgresql_endpoint`
- `postgresql_address`
- `postgresql_port`
- `postgresql_database_name`
- `postgresql_username`
- `kyverno_cluster_policies`
- `tetragon_policy_namespaces`

Those outputs are most useful for:

- checking the shared namespaces and service names Terraform created
- inspecting the RDS endpoint and control-plane namespace
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
cd infrastructure/stages/platform
terraform init -reconfigure -backend-config=backend.hcl
terraform plan
terraform apply
```

## Validation

After apply:

```bash
kubectl get pods -A
```

```bash
kubectl -n kube-system get pods -l k8s-app=cilium
```

```bash
kubectl -n kube-system get deploy coredns
```

```bash
kubectl -n isolens-system get deploy,svc
```

```bash
aws rds describe-db-instances --db-instance-identifier isolens-postgresql
```

```bash
kubectl exec -n isolens-system deploy/isolens-backend -- nc -vz <rds-endpoint> 5432
```

Expected results:

- Cilium agents are `Ready`
- CoreDNS is `Available`
- backend, frontend, and runner are running in `isolens-system`
- the RDS instance is `available`
- the backend can open a TCP connection to PostgreSQL

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
| control_plane_runner_name | Deployment name for the control-plane Terraform runner. | `string` | `"isolens-runner"` | no |
| control_plane_runner_replicas | Replica count for the control-plane Terraform runner. | `number` | `1` | no |
| control_plane_runner_resources | Resource requests and limits for the control-plane Terraform runner container. | <pre>object({<br/>    requests_cpu    = string<br/>    requests_memory = string<br/>    limits_cpu      = string<br/>    limits_memory   = string<br/>  })</pre> | <pre>{<br/>  "limits_cpu": "1000m",<br/>  "limits_memory": "1Gi",<br/>  "requests_cpu": "250m",<br/>  "requests_memory": "512Mi"<br/>}</pre> | no |
| enable_ingress_nginx | Whether the shared nginx ingress controller should be installed by the platform layer. | `bool` | `false` | no |
| environment | Environment name used for tags and naming. | `string` | `"lab"` | no |
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
| postgresql_password | Application password stored in the PostgreSQL Secret. | `string` | `"isolens-dev-password-change-me"` | no |
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
| control_plane_namespace | Namespace reserved for the Isolens backend and frontend workloads. |
| control_plane_runner_name | Deployment name for the control-plane Terraform runner. |
| ingress_controller_namespace | Namespace containing the nginx ingress controller when nginx-backed ingresses are enabled. |
| kyverno_namespace | Namespace containing the Kyverno policy engine. |
| postgresql_address | DNS address of the RDS PostgreSQL instance used by the control plane. |
| postgresql_database_name | Database name provisioned for the control plane. |
| postgresql_endpoint | Endpoint of the RDS PostgreSQL instance used by the control plane. |
| postgresql_port | Port exposed by the RDS PostgreSQL instance. |
| postgresql_username | Application username provisioned for the control plane database. |
| update_kubeconfig_command | Command to merge this cluster into the local kubeconfig. |
<!-- END_TF_DOCS -->
