output "kyverno_cluster_policies" {
  description = "Kyverno ClusterPolicy objects managed by the policies module."
  value = [
    "require-ward-subject-label",
    "disallow-latest-tag-in-wards",
  ]
}

output "tetragon_policy_namespaces" {
  description = "Namespaces that receive Tetragon tracing policies."
  value       = sort(keys(var.analysis_subjects))
}
