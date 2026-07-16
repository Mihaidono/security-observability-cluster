# Applications Terraform Root

Owns the application-scoped layer applied after the shared cluster platform is ready.

## Ownership Boundary

This stage owns:

- ward namespaces
- application Deployments
- application Services
- application Ingress resources
- application ConfigMaps, volumes, and app-specific network policies generated from the JSON model

This stage does not own:

- Cilium
- CoreDNS
- Kyverno
- Tetragon
- the control-plane namespace
- the control-plane PostgreSQL database

Those shared resources belong to the `platform` stage.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| terraform | >= 1.7.0 |
| aws | 5.100.0 |
| kubernetes | 2.37.1 |
| time | 0.13.1 |

## Modules

| Name | Source | Version |
| ---- | ------ | ------- |
| subjects | ../../modules/ward-subjects | n/a |
| workloads | ../../modules/ward-workloads | n/a |

## Resources

| Name | Type |
| ---- | ---- |
| [time_sleep.cluster_access_ready](https://registry.terraform.io/providers/hashicorp/time/0.13.1/docs/resources/sleep) | resource |
| [aws_eks_cluster.this](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/data-sources/eks_cluster) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| analysis_subjects | Ward namespace definitions used to validate application placement. | `map(any)` | `{}` | no |
| cluster_admin_principal_arns | IAM principal ARNs granted cluster-admin access in the core stage. Used here to keep the post-core readiness wait tied to access configuration changes. | `list(string)` | `[]` | no |
| cluster_name | Name of the existing EKS cluster targeted by the applications stage. | `string` | `"forensic-lab"` | no |
| environment | Environment name used for tags and naming. | `string` | `"lab"` | no |
| kubernetes_version | Cluster Kubernetes version used to label ward namespaces with the matching PSA version. | `string` | `"1.35"` | no |
| project_name | Logical project name used for tagging and naming. | `string` | `"isolens"` | no |
| region | AWS region of the existing EKS cluster targeted by the applications stage. | `string` | `"eu-north-1"` | no |
| ward_applications | Application definitions rendered into Deployments plus optional Services, Ingresses, generated ConfigMaps, volumes, and app-specific NetworkPolicies. | `any` | `[]` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| update_kubeconfig_command | Command to merge this cluster into the local kubeconfig. |
| ward_ingress_hosts | Hosts configured for ward application ingress resources. |
| ward_kubectl_commands | Useful kubectl commands for interacting with ward application deployments. |
| ward_namespaces | Ward namespaces created for analysis subjects. |
| ward_service_endpoints | Cluster-local DNS names for services created from ward applications. |
<!-- END_TF_DOCS -->
