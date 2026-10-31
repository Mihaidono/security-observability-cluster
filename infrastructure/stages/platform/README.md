# Platform Terraform Stage

The `platform` stage owns the shared in-cluster layer that sits on top of an existing EKS cluster.

## Ownership Boundary

This stage owns:

- Cilium, Hubble, Tetragon, Kyverno, optional `ingress-nginx`, and optional cert-manager
- the `isolens-system` namespace
- backend, frontend, runner, and Keycloak workloads
- the control-plane PostgreSQL RDS instance
- the shared Cilium `Gateway` used by application `HTTPRoute` resources
- the optional public Cilium `Gateway` and Route53 record for the control-plane frontend
- the optional frontend ACME Issuer and Certificate

Gateway API and cert-manager CRDs are owned by the `platform-prerequisites` stage. The
repository workflow and `./tfstage platform apply` reconcile that stage before
planning this stage.

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
- a bootstrap realm and OIDC client for the frontend login flow

Identity is handled by Keycloak. The backend still owns:

- control-plane sessions
- authorization checks
- audit logging

The platform stage bootstraps the Keycloak realm and client, then leaves ongoing user and role management to Keycloak administration.

## Database Layout

This stage provisions one private RDS PostgreSQL instance and uses it for two logical databases:

1. the control-plane backend database
2. the Keycloak database

The instance is private, SG-restricted to the EKS worker-node security group, and both database users use generated passwords stored in Terraform state.

## Direct Terraform Usage

For a clean cluster, use the helper to apply the prerequisite CRDs and the
platform in the correct order:

```bash
./tfstage platform apply
```

To review the two roots separately:

```bash
./tfstage platform init -reconfigure -backend-config=backend.hcl
./tfstage platform-prerequisites init -reconfigure -backend-config=backend.hcl
terraform -chdir=infrastructure/stages/platform-prerequisites validate
./tfstage platform-prerequisites plan
./tfstage platform-prerequisites apply
terraform -chdir=infrastructure/stages/platform validate
./tfstage platform plan
./tfstage platform apply
```

The GitHub Actions deployment performs the same prerequisite plan/apply before
planning the platform stage.

## Important Inputs

- `cluster_admin_principal_arns`
- `control_plane_public_app_url`
- `enable_control_plane_public_gateway`
- `control_plane_public_hostname`
- `control_plane_public_tls_secret_name`
- `control_plane_manage_tls`
- `control_plane_acme_server`
- `control_plane_acme_email`
- `control_plane_route53_zone_id`
- `enable_shared_applications_gateway`
- `shared_applications_gateway_name`
- `shared_applications_gateway_namespace`
- `control_plane_session_cookie_secure`
- `control_plane_backend_*`
- `control_plane_frontend_*`
- `control_plane_runner_*`
- `postgresql_*`
- `keycloak_*`

## Frontend domain in a separate AWS account

The lab configuration uses `https://isolens.endavahub.net`. Its dedicated
`isolens-frontend` Gateway terminates TLS on port 443 and routes only to the
frontend Service. Port 80 is reserved for cert-manager's temporary, exact-path
ACME challenge routes. The frontend HTTPRoute attaches only to the HTTPS
listener. Only HTTPRoutes in `isolens-system` can attach. Ward routes continue
to use `isolens-applications` on its separate load balancer.

The frontend serves the SPA and proxies `/api` to the backend. Login requires
`/auth/realms/isolens/` and `/auth/resources/`, which it proxies to Keycloak.
Other `/auth` paths (including administration, the master realm, health and
metrics) return 404. Backend and Keycloak Services remain ClusterIP. Hubble and
ward applications have no routes on this frontend Gateway. DNS alone is not an
access-control boundary: the HTTPS listener and HTTPRoute also match the exact
frontend hostname. Cluster administrators must keep this Gateway reserved for
the frontend; other HTTPRoutes in `isolens-system` could also attach.

### Prerequisites

- Access to the existing EKS cluster and the public `endavahub.net` hosted zone
  in its owning account. Confirm the domain delegates to that zone's name servers.
- Public inbound TCP ports 80 and 443 on the frontend load balancer. Keep port
  80 reachable for HTTP-01 renewal, including after initial issuance. Allow
  outbound HTTPS to ACME and the container registries, and DNS resolution.
- A new frontend image containing the proxy changes, published to ECR with a
  unique tag or digest. Set `control_plane_frontend_image` to that reference;
  reusing `latest` with `IfNotPresent` can keep the old proxy configuration.

### Automatic issuance and renewal

The shared capabilities file pins cert-manager to `v1.21.3`, which supports
Kubernetes 1.35. Prerequisites install its CRDs; platform add-ons install the
controller with Gateway API support. A namespaced Issuer requests only
`isolens.endavahub.net` using Let's Encrypt HTTP-01. No domain-account
credentials or additional AWS IAM permissions are needed.

cert-manager creates `isolens-frontend-tls` in `isolens-system`, renews when 33%
of the issued certificate's lifetime remains, and rotates its private key on
reissuance. Cilium consumes the updated Secret. Terraform manages the Issuer
and Certificate, without reading the generated certificate or private key into
state. Do not create or manually overwrite this managed Secret.

`control_plane_acme_email` is optional and empty by default; set an operational
contact if required. The lab uses the production ACME directory. For issuance
tests, temporarily set `control_plane_acme_server` to
`https://acme-staging-v02.api.letsencrypt.org/directory`. Staging certificates
are not browser-trusted. Restore the production directory and apply again for
a trusted certificate; verify readiness and the served chain. Avoid repeatedly
deleting Certificates or Secrets, which can trigger ACME rate limits.

### Deploy and create DNS

`control_plane_route53_zone_id` is empty for this setup. Terraform creates the
Gateway without attempting DNS changes using the platform account. Setting a
zone ID enables the existing Terraform CNAME resource in the platform account;
it does not assume a role in a different account.

```bash
./tfstage platform-prerequisites plan
./tfstage platform-prerequisites apply
./tfstage platform plan
./tfstage platform apply
terraform -chdir=infrastructure/stages/platform output -json control_plane_dns_record
```

Review the plan before applying. Enabling this Gateway provisions an additional
internet-facing AWS load balancer with associated charges. The URL change rolls
the backend, frontend and single-replica Keycloak workload and reconciles the
OIDC client's redirect URI. Expect a brief login interruption; existing login
flows should be restarted. Traffic from the Gateway to the frontend and from
the frontend to its backends remains HTTP inside the cluster.

On first deployment, apply prerequisites **before the platform plan** so the
Kubernetes provider can discover the new certificate APIs. The existing CI
workflow performs this ordering. Platform apply creates the Certificate without
waiting for issuance: it must return the load balancer DNS target before you
can create the cross-account CNAME. HTTPS is not ready until DNS is in place
and cert-manager completes the challenge. Before that, `Issuing`/pending
Certificate status and an unresolved Gateway TLS Secret are expected.

In the **domain account**, create this record in the public `endavahub.net` zone:

| Field | Value |
| ----- | ----- |
| Name | `isolens.endavahub.net` |
| Type | `CNAME` (Alias disabled) |
| Value | `target` from `control_plane_dns_record` |
| TTL | `60` |

Use the dedicated `cilium-gateway-isolens-frontend` load balancer hostname.
Do not use the applications load balancer, a wildcard record, or its resolved
IP addresses. A Route 53 A **alias** to the frontend ELB is also possible across
accounts, but a plain A record containing its current IP is not stable.
No domain transfer or hosted-zone delegation change is needed when the existing
zone is already authoritative.

### Validate

```bash
kubectl -n cert-manager get deploy,pods
kubectl -n isolens-system get issuer,certificate,certificaterequest,order,challenge
kubectl -n isolens-system wait --for=condition=Ready \
  certificate/isolens-frontend-tls --timeout=20m
kubectl -n isolens-system wait --for=condition=Programmed \
  gateway/isolens-frontend --timeout=20m
kubectl -n isolens-system get gateway isolens-frontend -o yaml
kubectl -n isolens-system get httproute isolens-frontend-frontend -o yaml
kubectl -n isolens-system get svc cilium-gateway-isolens-frontend
dig +short CNAME isolens.endavahub.net
curl --fail --show-error --head https://isolens.endavahub.net/
curl --fail --show-error https://isolens.endavahub.net/api/auth/config
curl --fail --show-error \
  https://isolens.endavahub.net/auth/realms/isolens/.well-known/openid-configuration
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  https://isolens.endavahub.net/api/config
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  https://isolens.endavahub.net/auth/admin/
curl --silent --output /dev/null --write-out '%{http_code}\n' \
  https://isolens.endavahub.net/auth/realms/master/
```

Require listener `Accepted`, `ResolvedRefs` and `Programmed`, and route
`Accepted` and `ResolvedRefs` conditions to be True. The HTTPS request must pass
certificate verification. The OIDC issuer must be
`https://isolens.endavahub.net/auth/realms/isolens`, without `http` or port 8080.
The last three curl commands must return `401`, `404`, `404` without a session.
Sign in in a browser, verify `/login/callback`, the secure session cookie, UI
data loading, run WebSocket streaming and logout. Confirm ward exposure URLs
still use their existing load balancer. The frontend HTTPRoute does not attach
to the port 80 listener: `curl -I http://isolens.endavahub.net/` must return 404 rather than the
UI or a login page. Only temporary challenge-token paths may return 200 during
issuance. Use `https://` for the UI.

Monitor Certificate `Ready`, `status.notAfter` and `status.renewalTime` so renewal
failures are detected before expiry. If issuance stalls, inspect the namespaced
Order/Challenge status and `kubectl -n cert-manager logs deploy/cert-manager`.
Check public DNS, port 80 reachability, CAA policy permitting Let's Encrypt,
solver HTTPRoute attachment, and solver pod readiness. Do not print Secrets.

For Keycloak administration, use a private connection:

```bash
kubectl -n isolens-system port-forward svc/isolens-keycloak 8081:8080
```

Because Keycloak pins its public hostname, use a local TLS reverse proxy or SSH
tunnel that preserves `https://isolens.endavahub.net/auth` for browser-based
administration. The Admin REST API remains available over the port-forward at
`http://127.0.0.1:8081/auth/admin/` for authenticated administration tools.

### Rollback

Remove the manually managed frontend DNS record in the domain account. Set
`control_plane_manage_tls = false` and `enable_control_plane_public_gateway = false`, restore the previous
`control_plane_public_app_url` and frontend image reference, and review/apply
the platform plan. This removes the dedicated frontend Gateway and its load
balancer and reconciles the old login origin. Leave the applications Gateway
enabled. Restore a previously HTTPS-compatible frontend access path; secure
cookies do not work over plain HTTP. Keep `enable_cert_manager = true` in the
shared capabilities file; do not destroy its CRDs. The controller leaves the
TLS and ACME account Secrets after Certificate/Issuer removal. Retain them until
rollback is complete; a retained certificate will not renew without its
Certificate resource. A recreated load balancer requires a DNS update.

To keep HTTPS while reverting to external certificate management, first arrange
an external renewal process, then set only `control_plane_manage_tls = false`.
This removes the managed Certificate/Issuer and port 80 listener while retaining
the TLS Secret and HTTPS listener.

References:

- [AWS: alias records for a load balancer in another account](https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-values-alias-common.html)
- [Cilium 1.19.5: HTTPS Gateway example](https://github.com/cilium/cilium/blob/v1.19.5/Documentation/network/servicemesh/gateway-api/https.rst)
- [Keycloak 26.6.4: reverse proxy](https://github.com/keycloak/keycloak/blob/26.6.4/docs/guides/server/reverseproxy.adoc)
- [Keycloak 26.6.4: hostname and backchannel](https://github.com/keycloak/keycloak/blob/26.6.4/docs/guides/server/hostname.adoc)
- [Kubernetes provider 2.37.1: manifest wait conditions](https://github.com/hashicorp/terraform-provider-kubernetes/blob/v2.37.1/docs/resources/manifest.md)
- [cert-manager supported Kubernetes versions](https://cert-manager.io/docs/releases/)
- [cert-manager Gateway HTTP-01 solver](https://cert-manager.io/docs/configuration/acme/http01/#configuring-the-http-01-gateway-api-solver)
- [cert-manager Certificate renewal and private-key rotation](https://cert-manager.io/docs/usage/certificate/)
- [Let's Encrypt HTTP-01 requirements](https://letsencrypt.org/docs/challenge-types/#http-01-challenge)

## Important Outputs

- `control_plane_namespace`
- `control_plane_backend_service_name`
- `control_plane_backend_service_fqdn`
- `control_plane_frontend_service_name`
- `control_plane_public_url`
- `control_plane_gateway_name`
- `control_plane_gateway_service_name`
- `control_plane_dns_record`
- `control_plane_certificate_issuer_name`
- `shared_applications_gateway_name`
- `shared_applications_gateway_namespace`
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
kubectl -n isolens-system exec deploy/isolens-backend -- \
  printenv ISOLENS_PUBLIC_APP_URL ISOLENS_OIDC_REALM ISOLENS_OIDC_CLIENT_ID
```

After Keycloak is healthy, verify the bootstrap completed:

- the realm named by `keycloak_realm` exists
- the client named by `keycloak_client_id` exists
- the redirect URI `${control_plane_public_app_url}/login/callback` is present
- the web origin `control_plane_public_app_url` is present
- the client mode matches your configuration:
  `public` + PKCE when `keycloak_client_secret` is empty, or `confidential` when you set a secret explicitly

Ongoing user, group, and role management stays in Keycloak administration after bootstrap.

```bash
aws rds describe-db-instances --db-instance-identifier isolens-postgresql
```

Expected results:

- Cilium agents are ready
- CoreDNS is available
- backend, frontend, runner, and Keycloak are healthy in `isolens-system`
- the shared applications Gateway exists when enabled
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
| [aws_route53_record.control_plane_frontend](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/route53_record) | resource |
| [kubernetes_manifest.control_plane_acme_issuer](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/manifest) | resource |
| [kubernetes_manifest.control_plane_certificate](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/manifest) | resource |
| [kubernetes_manifest.control_plane_frontend_route](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/manifest) | resource |
| [kubernetes_manifest.control_plane_gateway](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/manifest) | resource |
| [kubernetes_manifest.shared_applications_gateway](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/manifest) | resource |
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
| [kubernetes_service_v1.control_plane_gateway](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/data-sources/service_v1) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| cert_manager_version | Pinned cert-manager Helm release including the v prefix; shared with the prerequisite CRD version. | `string` | n/a | yes |
| cluster_admin_principal_arns | IAM principal ARNs granted cluster-admin access in the core stage. Used here to keep the post-core readiness wait tied to access configuration changes. | `list(string)` | `[]` | no |
| cluster_name | Name of the existing EKS cluster targeted by the platform stage. | `string` | `"forensic-lab"` | no |
| control_plane_acme_email | Optional contact email for the frontend ACME account. Empty omits ACME contact registration. | `string` | `""` | no |
| control_plane_acme_server | ACME directory for frontend certificates. Use the Let's Encrypt staging directory for issuance tests. | `string` | `"https://acme-v02.api.letsencrypt.org/directory"` | no |
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
| control_plane_manage_tls | Whether cert-manager should issue and renew the frontend TLS secret using ACME HTTP-01 on the dedicated Gateway's port 80 listener. | `bool` | `false` | no |
| control_plane_namespace | Namespace reserved for the Isolens backend and frontend workloads. | `string` | `"isolens-system"` | no |
| control_plane_namespace_annotations | Additional annotations applied to the control-plane namespace. | `map(string)` | `{}` | no |
| control_plane_namespace_labels | Additional labels applied to the control-plane namespace. | `map(string)` | `{}` | no |
| control_plane_public_app_url | Public base URL of the control-plane frontend, used for Keycloak redirects and issuer URLs. | `string` | `"http://localhost:5173"` | no |
| control_plane_public_hostname | Public DNS hostname for the control-plane frontend when the public gateway is enabled. | `string` | `""` | no |
| control_plane_public_tls_secret_name | Name of the TLS secret presented by the public Gateway listener. | `string` | `""` | no |
| control_plane_route53_record_ttl | TTL in seconds for the public Route53 CNAME record. | `number` | `60` | no |
| control_plane_route53_zone_id | Optional Route53 hosted zone ID in the platform AWS account. Leave empty to create the CNAME separately, including in another AWS account. | `string` | `""` | no |
| control_plane_runner_name | Deployment name for the control-plane Terraform runner. | `string` | `"isolens-runner"` | no |
| control_plane_runner_replicas | Replica count for the control-plane Terraform runner. | `number` | `1` | no |
| control_plane_runner_resources | Resource requests and limits for the control-plane Terraform runner container. | <pre>object({<br/>    requests_cpu    = string<br/>    requests_memory = string<br/>    limits_cpu      = string<br/>    limits_memory   = string<br/>  })</pre> | <pre>{<br/>  "limits_cpu": "1000m",<br/>  "limits_memory": "1Gi",<br/>  "requests_cpu": "250m",<br/>  "requests_memory": "512Mi"<br/>}</pre> | no |
| control_plane_session_cookie_secure | Whether the backend session cookie should require HTTPS. | `bool` | `true` | no |
| control_plane_session_ttl_seconds | Maximum lifetime of a control-plane session in seconds. | `number` | `7200` | no |
| enable_cert_manager | Whether to install cert-manager. Its CRDs are installed first by platform-prerequisites using the shared capabilities file. | `bool` | `false` | no |
| enable_control_plane_public_gateway | Whether to expose the control-plane frontend through a dedicated HTTPS Cilium Gateway. DNS is managed separately unless control_plane_route53_zone_id is set. | `bool` | `false` | no |
| enable_ingress_nginx | Whether the shared nginx ingress controller should be installed by the platform layer. | `bool` | `false` | no |
| enable_shared_applications_gateway | Whether to create the shared Cilium Gateway used by application HTTPRoutes across ward namespaces. | `bool` | `true` | no |
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
| shared_applications_gateway_name | Gateway name used for shared application exposure routes. | `string` | `"isolens-applications"` | no |
| shared_applications_gateway_namespace | Namespace that owns the shared applications Gateway. | `string` | `"isolens-system"` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| control_plane_backend_service_fqdn | Cluster-local DNS name for the control-plane backend service. |
| control_plane_backend_service_name | ClusterIP Service name for the control-plane backend. |
| control_plane_certificate_issuer_name | Namespaced ACME Issuer used by the managed frontend certificate. Changes when the ACME directory changes. |
| control_plane_dns_record | CNAME to create in the domain account when DNS is managed separately. Use the dedicated frontend load balancer, never the shared applications gateway. |
| control_plane_frontend_service_name | Service name for the control-plane frontend. |
| control_plane_gateway_name | Gateway resource name used for the public control-plane frontend entrypoint when enabled. |
| control_plane_gateway_service_name | LoadBalancer service name created by Cilium for the public control-plane Gateway when enabled. |
| control_plane_keycloak_service_fqdn | Cluster-local DNS name for the control-plane Keycloak service. |
| control_plane_keycloak_service_name | ClusterIP Service name for the control-plane Keycloak workload. |
| control_plane_namespace | Namespace reserved for the Isolens backend and frontend workloads. |
| control_plane_public_url | Public URL used by the frontend and Keycloak redirect flow. |
| control_plane_runner_name | Deployment name for the control-plane Terraform runner. |
| ingress_controller_namespace | Namespace containing the nginx ingress controller when nginx-backed ingresses are enabled. |
| keycloak_admin_username | Bootstrap Keycloak admin username. |
| keycloak_database_name | Database name provisioned for Keycloak on the shared PostgreSQL instance. |
| keycloak_database_username | Database username provisioned for Keycloak on the shared PostgreSQL instance. |
| keycloak_realm | Keycloak realm used by the Isolens control plane. |
| kyverno_namespace | Namespace containing the Kyverno policy engine. |
| postgresql_address | DNS address of the RDS PostgreSQL instance used by the control plane. |
| postgresql_database_name | Database name provisioned for the control plane. |
| postgresql_endpoint | Endpoint of the RDS PostgreSQL instance used by the control plane. |
| postgresql_port | Port exposed by the RDS PostgreSQL instance. |
| postgresql_username | Application username provisioned for the control plane database. |
| shared_applications_gateway_name | Gateway resource name used for shared application exposure routes when enabled. |
| shared_applications_gateway_namespace | Namespace that owns the shared applications Gateway when enabled. |
| update_kubeconfig_command | Command to merge this cluster into the local kubeconfig. |
<!-- END_TF_DOCS -->
