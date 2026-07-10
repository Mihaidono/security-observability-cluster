# Policies Stack Module

Applies the Kyverno and Tetragon policy resources used by the policy layer.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| terraform | >= 1.7.0 |
| helm | 2.17.0 |

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [helm_release.policy_manifests](https://registry.terraform.io/providers/hashicorp/helm/2.17.0/docs/resources/release) | resource |

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
