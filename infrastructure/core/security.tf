resource "kubernetes_namespace" "kyverno" {
  metadata {
    name = "kyverno"
    labels = {
      "pod-security.kubernetes.io/enforce"         = "baseline"
      "pod-security.kubernetes.io/enforce-version" = local.kubernetes_psa_version
      "observability-role"                         = "policy-engine"
    }
  }

  depends_on = [aws_eks_access_policy_association.cluster_admins]
}

resource "helm_release" "kyverno" {
  name            = "kyverno"
  repository      = "https://kyverno.github.io/kyverno/"
  chart           = "kyverno"
  version         = "3.8.0"
  namespace       = kubernetes_namespace.kyverno.metadata[0].name
  wait            = true
  timeout         = 900
  atomic          = true
  cleanup_on_fail = true

  depends_on = [kubernetes_namespace.kyverno]
}
