resource "kubernetes_namespace_v1" "control_plane" {
  metadata {
    name = var.control_plane_namespace
    labels = merge({
      "pod-security.kubernetes.io/enforce"         = "baseline"
      "pod-security.kubernetes.io/enforce-version" = startswith(var.kubernetes_version, "v") || var.kubernetes_version == "latest" ? var.kubernetes_version : "v${var.kubernetes_version}"
      "isolens.io/component"                       = "control-plane"
      "app.kubernetes.io/part-of"                  = "isolens"
    }, var.control_plane_namespace_labels)
    annotations = var.control_plane_namespace_annotations
  }

  depends_on = [time_sleep.cluster_access_ready]
}
