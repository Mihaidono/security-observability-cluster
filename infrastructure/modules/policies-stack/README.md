# Policies Stack Module

Applies the Kyverno and Tetragon policy resources used by the policy layer.

<!-- BEGIN_TF_DOCS -->
## Requirements

No requirements.

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [kubernetes_manifest.kyverno_disallow_latest_tag](https://registry.terraform.io/providers/hashicorp/kubernetes/latest/docs/resources/manifest) | resource |
| [kubernetes_manifest.kyverno_require_subject_label](https://registry.terraform.io/providers/hashicorp/kubernetes/latest/docs/resources/manifest) | resource |
| [kubernetes_manifest.tetragon_suspicious_exec](https://registry.terraform.io/providers/hashicorp/kubernetes/latest/docs/resources/manifest) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| analysis_subjects | Validated ward namespace definitions from the root module. | `map(any)` | n/a | yes |

## Outputs

| Name | Description |
| ---- | ----------- |
| kyverno_cluster_policies | Kyverno ClusterPolicy objects managed by the policies module. |
| tetragon_policy_namespaces | Namespaces that receive Tetragon tracing policies. |
<!-- END_TF_DOCS -->
