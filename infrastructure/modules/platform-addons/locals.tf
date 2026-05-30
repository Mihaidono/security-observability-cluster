locals {
  kubernetes_psa_version = var.kubernetes_version == "latest" ? "latest" : (
    startswith(var.kubernetes_version, "v") ? var.kubernetes_version : "v${var.kubernetes_version}"
  )

  hubble_ui_ingress_enabled = var.expose_hubble_ui && trim(var.hubble_ui_host) != ""

  ingress_apps = [
    for app in var.ward_applications : app
    if try(app.ingress.enabled, false) && try(app.service.enabled, true)
  ]

  ingress_class_names = toset([
    for app in local.ingress_apps : app.ingress.class_name
    if try(app.ingress.class_name, null) != null
  ])

  platform_ingress_class_names = toset(local.hubble_ui_ingress_enabled ? [var.hubble_ui_ingress_class_name] : [])

  requires_ingress_nginx = contains(setunion(local.ingress_class_names, local.platform_ingress_class_names), "nginx")

  hubble_ui_ingress_annotations = merge(
    length(var.observability_ingress_whitelist_cidrs) > 0 ? {
      "nginx.ingress.kubernetes.io/whitelist-source-range" = join(",", var.observability_ingress_whitelist_cidrs)
    } : {},
    var.hubble_ui_ingress_annotations,
  )
}
