resource "kubernetes_namespace_v1" "control_plane" {
  metadata {
    name = var.namespace
    labels = merge({
      "pod-security.kubernetes.io/enforce"         = "baseline"
      "pod-security.kubernetes.io/enforce-version" = local.kubernetes_psa_version
      "isolens.io/component"                       = "control-plane"
      "app.kubernetes.io/part-of"                  = "isolens"
    }, var.labels)
    annotations = var.annotations
  }
}
