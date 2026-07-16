output "kyverno_namespace" {
  description = "Namespace containing the Kyverno policy engine."
  value       = kubernetes_namespace_v1.kyverno.metadata[0].name
}

output "ingress_controller_namespace" {
  description = "Namespace containing the nginx ingress controller when nginx-backed ingresses are enabled."
  value       = var.enable_ingress_nginx ? kubernetes_namespace_v1.ingress_nginx[0].metadata[0].name : null
}
