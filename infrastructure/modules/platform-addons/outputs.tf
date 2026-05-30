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
