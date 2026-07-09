# Control Plane Module

Creates the namespace reserved for the Isolens control-plane workloads.

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
| [kubernetes_namespace_v1.control_plane](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/namespace_v1) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| annotations | Additional annotations applied to the control-plane namespace. | `map(string)` | `{}` | no |
| kubernetes_version | Cluster Kubernetes version used to label the namespace with the matching PSA version. | `string` | n/a | yes |
| labels | Additional labels applied to the control-plane namespace. | `map(string)` | `{}` | no |
| namespace | Namespace used for the Isolens control-plane workloads. | `string` | n/a | yes |

## Outputs

| Name | Description |
| ---- | ----------- |
| namespace | Namespace reserved for the Isolens backend and frontend workloads. |
<!-- END_TF_DOCS -->
