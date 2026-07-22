# Policies Stack Module

Applies the Kyverno and Tetragon policy resources used by the policy layer.

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
| [kubernetes_manifest.kyverno_cluster_policy](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/manifest) | resource |
| [kubernetes_manifest.tetragon_tracing_policy](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/manifest) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| analysis_subjects | Validated ward namespace definitions from the root module. | `map(any)` | n/a | yes |
| kyverno_cluster_policies | Kyverno ClusterPolicy manifests managed by the policies module. | `any` | `[]` | no |
| tetragon_tracing_policies | Tetragon tracing policy manifests managed by the policies module. | `any` | `[]` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| kyverno_cluster_policies | Kyverno ClusterPolicy objects managed by the policies module. |
| tetragon_policy_namespaces | Namespaces that receive Tetragon tracing policies. |
<!-- END_TF_DOCS -->
