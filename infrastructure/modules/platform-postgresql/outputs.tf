output "service_name" {
  description = "Kubernetes Service name used for PostgreSQL."
  value       = kubernetes_service_v1.postgresql.metadata[0].name
}

output "service_fqdn" {
  description = "Cluster-local DNS name for the PostgreSQL service."
  value       = "${kubernetes_service_v1.postgresql.metadata[0].name}.${var.namespace}.svc.cluster.local"
}

output "secret_name" {
  description = "Secret containing the PostgreSQL connection credentials."
  value       = kubernetes_secret_v1.credentials.metadata[0].name
}

output "database_name" {
  description = "Application database name."
  value       = var.database_name
}

output "username" {
  description = "Application username for PostgreSQL."
  value       = var.username
}
