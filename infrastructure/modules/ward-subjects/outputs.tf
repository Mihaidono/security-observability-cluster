output "ward_namespaces" {
  description = "Ward namespaces created for analysis subjects."
  value       = sort(keys(local.analysis_subjects))
}
