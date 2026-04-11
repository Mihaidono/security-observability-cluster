resource "kubernetes_namespace" "kyverno" {
  metadata {
    name = "kyverno"
    labels = {
      "pod-security.kubernetes.io/enforce"         = "baseline"
      "pod-security.kubernetes.io/enforce-version" = var.kubernetes_version
      "observability-role"                         = "policy-engine"
    }
  }
}

resource "helm_release" "kyverno" {
  name       = "kyverno"
  repository = "https://kyverno.github.io/kyverno/"
  chart      = "kyverno"
  namespace  = kubernetes_namespace.kyverno.metadata[0].name
  wait       = true

  depends_on = [kubernetes_namespace.kyverno]
}
