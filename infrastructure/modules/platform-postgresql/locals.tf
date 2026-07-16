locals {
  labels = merge({
    "app.kubernetes.io/name"       = var.name
    "app.kubernetes.io/component"  = "database"
    "app.kubernetes.io/managed-by" = "terraform"
    "app.kubernetes.io/part-of"    = "isolens"
  }, var.tags)

  final_snapshot_identifier = "${replace(var.name, "_", "-")}-final"
}
