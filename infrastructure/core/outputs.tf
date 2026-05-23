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
  value       = module.subjects.ward_namespaces
}

output "monitoring_namespace" {
  description = "Namespace containing the observability stack."
  value       = module.addons.monitoring_namespace
}

output "monitoring_release_name" {
  description = "Helm release name used for the monitoring agent stack."
  value       = module.addons.monitoring_release_name
}

output "kyverno_namespace" {
  description = "Namespace containing the Kyverno policy engine."
  value       = module.addons.kyverno_namespace
}

output "update_kubeconfig_command" {
  description = "Command to merge this cluster into the local kubeconfig."
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${module.eks.cluster_name}"
}

output "ward_service_endpoints" {
  description = "Cluster-local DNS names for services created from ward_applications."
  value       = module.workloads.ward_service_endpoints
}

output "ward_kubectl_commands" {
  description = "Useful kubectl commands for interacting with ward application deployments."
  value       = module.workloads.ward_kubectl_commands
}

output "ward_ingress_hosts" {
  description = "Hosts configured for ward application ingress resources."
  value       = module.workloads.ward_ingress_hosts
}

output "ingress_controller_namespace" {
  description = "Namespace containing the nginx ingress controller when nginx-backed ingresses are enabled."
  value       = module.addons.ingress_controller_namespace
}
