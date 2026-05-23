output "kyverno_cluster_policies" {
  description = "Kyverno ClusterPolicy objects managed by the policies stage."
  value       = module.policy_manifests.kyverno_cluster_policies
}

output "tetragon_policy_namespaces" {
  description = "Namespaces that receive Tetragon tracing policies."
  value       = module.policy_manifests.tetragon_policy_namespaces
}
