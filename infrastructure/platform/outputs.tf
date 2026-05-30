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
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${var.cluster_name}"
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

output "ingress_controller_namespace" {
  description = "Namespace containing the nginx ingress controller when nginx-backed ingresses are enabled."
  value       = module.addons.ingress_controller_namespace
}

output "hubble_ui_url" {
  description = "Platform-managed Hubble UI URL when a dedicated ingress endpoint is enabled."
  value       = module.addons.hubble_ui_url
}

output "identity_namespace" {
  description = "Namespace containing the platform-managed identity stack when observability identity is enabled."
  value       = module.addons.identity_namespace
}

output "keycloak_url" {
  description = "Platform-managed Keycloak URL when observability identity is enabled."
  value       = module.addons.keycloak_url
}

output "oauth2_proxy_url" {
  description = "Platform-managed oauth2-proxy URL when observability identity is enabled."
  value       = module.addons.oauth2_proxy_url
}

output "observability_demo_username" {
  description = "Bootstrap Keycloak username created for observability demos."
  value       = module.addons.observability_demo_username
}

output "observability_bootstrap_secret_name" {
  description = "Secret containing the generated Keycloak admin password and demo user password."
  value       = module.addons.observability_bootstrap_secret_name
}

output "keycloak_admin_password_command" {
  description = "kubectl command for retrieving the generated Keycloak admin password."
  value       = module.addons.keycloak_admin_password_command
}

output "observability_demo_password_command" {
  description = "kubectl command for retrieving the generated observability demo user password."
  value       = module.addons.observability_demo_password_command
}
