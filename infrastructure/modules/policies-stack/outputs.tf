output "kyverno_cluster_policies" {
  description = "Kyverno ClusterPolicy objects managed by the policies module."
  value = [
    kubernetes_manifest.kyverno_require_subject_label.manifest.metadata.name,
    kubernetes_manifest.kyverno_disallow_latest_tag.manifest.metadata.name,
  ]
}

output "tetragon_policy_namespaces" {
  description = "Namespaces that receive Tetragon tracing policies."
  value       = sort(keys(var.analysis_subjects))
}
