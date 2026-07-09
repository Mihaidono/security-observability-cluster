output "monitoring_namespace" {
  description = "Namespace containing the observability stack."
  value       = kubernetes_namespace_v1.monitoring.metadata[0].name
}

output "monitoring_release_name" {
  description = "Helm release name used for the monitoring agent stack."
  value       = helm_release.monitoring_agent.name
}

output "kyverno_namespace" {
  description = "Namespace containing the Kyverno policy engine."
  value       = kubernetes_namespace_v1.kyverno.metadata[0].name
}

output "ingress_controller_namespace" {
  description = "Namespace containing the nginx ingress controller when nginx-backed ingresses are enabled."
  value       = var.enable_ingress_nginx ? kubernetes_namespace_v1.ingress_nginx[0].metadata[0].name : null
}
