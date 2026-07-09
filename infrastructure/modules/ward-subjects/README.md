# Ward Subjects Module

Creates the ward namespaces and their baseline quota and policy controls.

<!-- BEGIN_TF_DOCS -->
## Requirements

No requirements.

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [kubernetes_config_map.ward_metadata](https://registry.terraform.io/providers/hashicorp/kubernetes/latest/docs/resources/config_map) | resource |
| [kubernetes_limit_range.ward_defaults](https://registry.terraform.io/providers/hashicorp/kubernetes/latest/docs/resources/limit_range) | resource |
| [kubernetes_namespace.wards](https://registry.terraform.io/providers/hashicorp/kubernetes/latest/docs/resources/namespace) | resource |
| [kubernetes_network_policy.allow_dns](https://registry.terraform.io/providers/hashicorp/kubernetes/latest/docs/resources/network_policy) | resource |
| [kubernetes_network_policy.default_deny](https://registry.terraform.io/providers/hashicorp/kubernetes/latest/docs/resources/network_policy) | resource |
| [kubernetes_resource_quota.ward_quota](https://registry.terraform.io/providers/hashicorp/kubernetes/latest/docs/resources/resource_quota) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| analysis_subjects | Validated ward namespace definitions from the root module. | `map(any)` | n/a | yes |
| kubernetes_version | Cluster Kubernetes version used to label namespaces with the matching PSA version. | `string` | n/a | yes |

## Outputs

| Name | Description |
| ---- | ----------- |
| ward_namespaces | Ward namespaces created for analysis subjects. |
<!-- END_TF_DOCS -->
