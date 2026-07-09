# Ward Workloads Module

Renders the workload objects for applications deployed into ward namespaces.

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
| [kubernetes_ingress_v1.ward_application](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/ingress_v1) | resource |
| [kubernetes_network_policy.allow_same_namespace_ingress](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/network_policy) | resource |
| [kubernetes_network_policy.application_egress_allowlist](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/network_policy) | resource |
| [kubernetes_network_policy.application_ingress_allowlist](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/network_policy) | resource |
| [kubernetes_service.ward_application](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/service) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| analysis_subject_names | Set of valid ward namespace names used to guard application placement. | `set(string)` | n/a | yes |
| ward_applications | Validated ward application definitions from the root module. | `list(any)` | n/a | yes |

## Outputs

| Name | Description |
| ---- | ----------- |
| ward_ingress_hosts | Hosts configured for ward application ingress resources. |
| ward_kubectl_commands | Useful kubectl commands for interacting with ward application deployments. |
| ward_service_endpoints | Cluster-local DNS names for services created from ward applications. |
<!-- END_TF_DOCS -->
