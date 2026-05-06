output "cluster_name" {
  description = "Name of the provisioned EKS cluster."
  value       = module.eks.cluster_name
}

output "cluster_endpoint" {
  description = "EKS API server endpoint."
  value       = module.eks.cluster_endpoint
}

output "cluster_security_group_id" {
  description = "Security group attached to the EKS control plane."
  value       = module.eks.cluster_security_group_id
}

output "cluster_log_group_name" {
  description = "CloudWatch log group receiving EKS control-plane logs."
  value       = aws_cloudwatch_log_group.eks_cluster.name
}

output "ward_namespaces" {
  description = "Ward namespaces created for analysis subjects."
  value       = sort(keys(local.analysis_subjects))
}

output "monitoring_namespace" {
  description = "Namespace containing the observability stack."
  value       = kubernetes_namespace.monitoring.metadata[0].name
}

output "monitoring_release_name" {
  description = "Helm release name used for the monitoring agent stack."
  value       = helm_release.monitoring_agent.name
}

output "kyverno_namespace" {
  description = "Namespace containing the Kyverno policy engine."
  value       = kubernetes_namespace.kyverno.metadata[0].name
}

output "update_kubeconfig_command" {
  description = "Command to merge this cluster into the local kubeconfig."
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${module.eks.cluster_name}"
}

output "ward_service_endpoints" {
  description = "Cluster-local DNS names for services created from ward_applications."
  value = {
    for name, app in local.ward_applications :
    name => app.service.enabled ? "${app.service.name}.${app.namespace}.svc.cluster.local:${app.service.port}" : null
  }
}

output "ward_kubectl_commands" {
  description = "Useful kubectl commands for interacting with ward application deployments."
  value = {
    for name, app in local.ward_applications :
    name => {
      pods       = "kubectl get pods -n ${app.namespace} -l isolens.io/application=${app.name}"
      deployment = "kubectl describe deployment -n ${app.namespace} ${app.name}"
      service    = app.service.enabled ? "kubectl get svc -n ${app.namespace} ${app.service.name}" : "service disabled"
    }
  }
}

output "ward_ingress_hosts" {
  description = "Hosts configured for ward application ingress resources."
  value = {
    for name, app in local.applications_with_ingress :
    name => app.ingress.host
  }
}

output "ingress_controller_namespace" {
  description = "Namespace containing the nginx ingress controller when nginx-backed ingresses are enabled."
  value       = local.requires_ingress_nginx ? kubernetes_namespace.ingress_nginx[0].metadata[0].name : null
}
