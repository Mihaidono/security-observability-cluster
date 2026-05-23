locals {
  kubernetes_psa_version = var.kubernetes_version == "latest" ? "latest" : (
    startswith(var.kubernetes_version, "v") ? var.kubernetes_version : "v${var.kubernetes_version}"
  )

  analysis_subjects = {
    for name, subject in var.analysis_subjects : name => merge(subject, {
      labels      = try(subject.labels, {})
      annotations = try(subject.annotations, {})
      resource_quota = merge({
        pods            = "10"
        requests_cpu    = "2"
        requests_memory = "4Gi"
        limits_cpu      = "4"
        limits_memory   = "8Gi"
      }, try(subject.resource_quota, {}))
    })
  }
}
