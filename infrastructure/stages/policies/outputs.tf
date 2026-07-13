output "kyverno_cluster_policies" {
  description = "Kyverno ClusterPolicy objects managed by the policies stage."
  value       = module.policy_manifests.kyverno_cluster_policies
}

output "tetragon_policy_namespaces" {
  description = "Namespaces that receive Tetragon tracing policies."
  value       = module.policy_manifests.tetragon_policy_namespaces
}

output "update_kubeconfig_command" {
  description = "Command to merge this cluster into the local kubeconfig."
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${var.cluster_name}"
}
