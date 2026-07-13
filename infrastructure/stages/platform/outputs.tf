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

output "ingress_controller_namespace" {
  description = "Namespace containing the nginx ingress controller when nginx-backed ingresses are enabled."
  value       = module.addons.ingress_controller_namespace
}

output "control_plane_namespace" {
  description = "Namespace reserved for the Isolens backend and frontend workloads."
  value       = module.control_plane.namespace
}

output "control_plane_backend_service_name" {
  description = "ClusterIP Service name for the control-plane backend."
  value       = module.control_plane.backend_service_name
}

output "control_plane_backend_service_fqdn" {
  description = "Cluster-local DNS name for the control-plane backend service."
  value       = module.control_plane.backend_service_fqdn
}

output "control_plane_frontend_service_name" {
  description = "Service name for the control-plane frontend."
  value       = module.control_plane.frontend_service_name
}

output "control_plane_runner_name" {
  description = "Deployment name for the control-plane Terraform runner."
  value       = module.control_plane.runner_name
}

output "postgresql_service_fqdn" {
  description = "Cluster-local DNS name for the PostgreSQL service used by the control plane."
  value       = module.postgresql.service_fqdn
}

output "postgresql_secret_name" {
  description = "Secret containing the PostgreSQL connection credentials."
  value       = module.postgresql.secret_name
}

output "postgresql_database_name" {
  description = "Database name provisioned for the control plane."
  value       = module.postgresql.database_name
}

output "postgresql_username" {
  description = "Application username provisioned for the control plane database."
  value       = module.postgresql.username
}
