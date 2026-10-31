locals {
  kubernetes_psa_version = var.kubernetes_version == "latest" ? "latest" : (
    startswith(var.kubernetes_version, "v") ? var.kubernetes_version : "v${var.kubernetes_version}"
  )

  namespace_name = var.namespace

  public_app_scheme    = split("://", var.public_app_url)[0]
  public_app_authority = split("/", split("://", var.public_app_url)[1])[0]
  public_app_port      = try(split(":", local.public_app_authority)[1], local.public_app_scheme == "https" ? "443" : "80")

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

  keycloak_labels = {
    "app.kubernetes.io/name"       = var.keycloak_name
    "app.kubernetes.io/component"  = "auth"
    "app.kubernetes.io/part-of"    = "isolens"
    "app.kubernetes.io/managed-by" = "terraform"
  }

  backend_service_fqdn  = "${var.backend_service_name}.${local.namespace_name}.svc.cluster.local"
  keycloak_service_fqdn = "${var.keycloak_name}.${local.namespace_name}.svc.cluster.local"
}
