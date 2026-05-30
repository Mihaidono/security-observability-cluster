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

output "ingress_controller_namespace" {
  description = "Namespace containing the nginx ingress controller when nginx-backed ingresses are enabled."
  value       = local.requires_ingress_nginx ? kubernetes_namespace.ingress_nginx[0].metadata[0].name : null
}

output "hubble_ui_url" {
  description = "Platform-managed Hubble UI URL when a dedicated ingress endpoint is enabled."
  value       = local.hubble_ui_ingress_enabled ? "http://${var.hubble_ui_host}" : null
}

output "identity_namespace" {
  description = "Namespace containing the platform-managed identity stack when observability identity is enabled."
  value       = local.observability_identity_enabled ? kubernetes_namespace.identity[0].metadata[0].name : null
}

output "keycloak_url" {
  description = "Platform-managed Keycloak URL when observability identity is enabled."
  value       = local.observability_identity_enabled ? "http://${var.keycloak_host}" : null
}

output "oauth2_proxy_url" {
  description = "Platform-managed oauth2-proxy URL when observability identity is enabled."
  value       = local.observability_identity_enabled ? "http://${var.oauth2_proxy_host}" : null
}

output "observability_demo_username" {
  description = "Bootstrap Keycloak username created for observability demos."
  value       = local.observability_identity_enabled ? var.observability_demo_username : null
}

output "observability_bootstrap_secret_name" {
  description = "Secret containing the generated Keycloak admin password and demo user password."
  value       = local.observability_identity_enabled ? kubernetes_secret.observability_identity_bootstrap[0].metadata[0].name : null
}

output "keycloak_admin_password_command" {
  description = "kubectl command for retrieving the generated Keycloak admin password."
  value       = local.observability_identity_enabled ? "kubectl -n ${local.identity_namespace} get secret ${kubernetes_secret.observability_identity_bootstrap[0].metadata[0].name} -o jsonpath='{.data.admin-password}' | base64 -d" : null
}

output "observability_demo_password_command" {
  description = "kubectl command for retrieving the generated observability demo user password."
  value       = local.observability_identity_enabled ? "kubectl -n ${local.identity_namespace} get secret ${kubernetes_secret.observability_identity_bootstrap[0].metadata[0].name} -o jsonpath='{.data.demo-user-password}' | base64 -d" : null
}
