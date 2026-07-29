# Ward Workloads Module

Renders the workload objects for applications deployed into ward namespaces.

Applications can expose HTTP traffic through the shared Cilium Gateway created by the `platform` stage. When `exposure.enabled`, `connectivity.internet_ingress_enabled`, and `service.enabled` are all true for an app, this module creates a `gateway.networking.k8s.io/v1` `HTTPRoute` instead of a legacy Kubernetes `Ingress`.

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
| [kubernetes_config_map.application_config](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/config_map) | resource |
| [kubernetes_deployment.ward_application](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/deployment) | resource |
| [kubernetes_manifest.ward_application_route](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/manifest) | resource |
| [kubernetes_network_policy.allow_same_namespace_ingress](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/network_policy) | resource |
| [kubernetes_network_policy.application_egress_allowlist](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/network_policy) | resource |
| [kubernetes_network_policy.application_ingress_allowlist](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/network_policy) | resource |
| [kubernetes_service.ward_application](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/service) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| analysis_subject_names | Set of valid ward namespace names used to guard application placement. | `set(string)` | n/a | yes |
| shared_applications_gateway_name | Gateway name used for shared application HTTPRoutes when exposure is enabled. | `string` | n/a | yes |
| shared_applications_gateway_namespace | Namespace that owns the shared applications Gateway. | `string` | n/a | yes |
| ward_applications | Validated ward application definitions from the root module. | `any` | n/a | yes |

## Outputs

| Name | Description |
| ---- | ----------- |
| ward_exposure_routes | Gateway exposure routes configured for ward applications. |
| ward_kubectl_commands | Useful kubectl commands for interacting with ward application deployments. |
| ward_service_endpoints | Cluster-local DNS names for services created from ward applications. |
<!-- END_TF_DOCS -->
