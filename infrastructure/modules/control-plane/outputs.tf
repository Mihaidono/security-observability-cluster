output "namespace" {
  description = "Namespace reserved for the Isolens backend and frontend workloads."
  value       = local.namespace_name
}

output "backend_service_name" {
  description = "ClusterIP Service name for the control-plane backend."
  value       = kubernetes_service_v1.backend.metadata[0].name
}

output "backend_service_fqdn" {
  description = "Cluster-local DNS name for the control-plane backend service."
  value       = local.backend_service_fqdn
}

output "frontend_service_name" {
  description = "Service name for the control-plane frontend."
  value       = kubernetes_service_v1.frontend.metadata[0].name
}

output "runner_name" {
  description = "Deployment name for the Terraform runner workload."
  value       = kubernetes_deployment_v1.runner.metadata[0].name
}
