output "update_kubeconfig_command" {
  description = "Command to merge this cluster into the local kubeconfig."
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${var.cluster_name}"
}

output "ward_namespaces" {
  description = "Ward namespaces created for analysis subjects."
  value       = module.subjects.ward_namespaces
}

output "ward_service_endpoints" {
  description = "Cluster-local DNS names for services created from ward applications."
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
