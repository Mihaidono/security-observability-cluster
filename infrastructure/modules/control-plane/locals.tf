locals {
  kubernetes_psa_version = var.kubernetes_version == "latest" ? "latest" : (
    startswith(var.kubernetes_version, "v") ? var.kubernetes_version : "v${var.kubernetes_version}"
  )

  backend_labels = {
    "app.kubernetes.io/name"       = var.backend_service_name
    "app.kubernetes.io/component"  = "backend"
    "app.kubernetes.io/part-of"    = "isolens"
    "app.kubernetes.io/managed-by" = "terraform"
  }

  frontend_labels = {
    "app.kubernetes.io/name"       = var.frontend_service_name
    "app.kubernetes.io/component"  = "frontend"
    "app.kubernetes.io/part-of"    = "isolens"
    "app.kubernetes.io/managed-by" = "terraform"
  }

  runner_labels = {
    "app.kubernetes.io/name"       = var.runner_name
    "app.kubernetes.io/component"  = "runner"
    "app.kubernetes.io/part-of"    = "isolens"
    "app.kubernetes.io/managed-by" = "terraform"
  }

  backend_service_fqdn = "${var.backend_service_name}.${var.namespace}.svc.cluster.local"
}
