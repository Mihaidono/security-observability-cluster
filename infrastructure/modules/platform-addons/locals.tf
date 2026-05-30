locals {
  kubernetes_psa_version = var.kubernetes_version == "latest" ? "latest" : (
    startswith(var.kubernetes_version, "v") ? var.kubernetes_version : "v${var.kubernetes_version}"
  )

  ingress_apps = [
    for app in var.ward_applications : app
    if try(app.ingress.enabled, false) && try(app.service.enabled, true)
  ]

  ingress_class_names = toset([
    for app in local.ingress_apps : app.ingress.class_name
    if try(app.ingress.class_name, null) != null
  ])

  requires_ingress_nginx = contains(local.ingress_class_names, "nginx")
}
