# Platform Add-ons Module

Installs the shared cluster add-ons used by the platform layer.

## Implementation Notes

- Cilium is installed as the primary Kubernetes networking layer for EKS.
- The deployment uses AWS ENI IPAM together with `kubeProxyReplacement=true`.
- Hubble is enabled for flow visibility.
- CoreDNS is installed only after Cilium is ready enough to remove the initial node taint.
- Tetragon and Kyverno are installed as shared platform capabilities.
- `ingress-nginx` is optional and disabled by default because the target direction is Cilium Gateway API rather than nginx ingress.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| terraform | >= 1.7.0 |
| aws | 5.100.0 |
| helm | 2.17.0 |
| kubernetes | 2.37.1 |

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [aws_eks_addon.coredns](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/eks_addon) | resource |
| [helm_release.cilium](https://registry.terraform.io/providers/hashicorp/helm/2.17.0/docs/resources/release) | resource |
| [helm_release.ingress_nginx](https://registry.terraform.io/providers/hashicorp/helm/2.17.0/docs/resources/release) | resource |
| [helm_release.kyverno](https://registry.terraform.io/providers/hashicorp/helm/2.17.0/docs/resources/release) | resource |
| [helm_release.tetragon](https://registry.terraform.io/providers/hashicorp/helm/2.17.0/docs/resources/release) | resource |
| [kubernetes_namespace_v1.ingress_nginx](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/namespace_v1) | resource |
| [kubernetes_namespace_v1.kyverno](https://registry.terraform.io/providers/hashicorp/kubernetes/2.37.1/docs/resources/namespace_v1) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| cilium_operator_iam_role_arn | IAM role ARN assumed by the Cilium operator for ENI management. | `string` | n/a | yes |
| cluster_endpoint | HTTPS endpoint of the EKS API server used by Cilium during kube-proxy-free bootstrap. | `string` | n/a | yes |
| cluster_name | Name of the EKS cluster where Cilium is installed. | `string` | n/a | yes |
| cluster_vpc_cidr | IPv4 CIDR block of the cluster VPC used for Cilium native routing. | `string` | n/a | yes |
| enable_ingress_nginx | Whether the shared nginx ingress controller should be installed by the platform layer. | `bool` | `false` | no |
| kubernetes_version | Cluster Kubernetes version used to label namespaces with the matching PSA version. | `string` | n/a | yes |

## Outputs

| Name | Description |
| ---- | ----------- |
| ingress_controller_namespace | Namespace containing the nginx ingress controller when nginx-backed ingresses are enabled. |
| kyverno_namespace | Namespace containing the Kyverno policy engine. |
<!-- END_TF_DOCS -->
