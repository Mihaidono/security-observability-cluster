resource "kubernetes_namespace" "ingress_nginx" {
  count = local.requires_ingress_nginx ? 1 : 0

  metadata {
    name = "ingress-nginx"
    labels = {
      "pod-security.kubernetes.io/enforce"         = "baseline"
      "pod-security.kubernetes.io/enforce-version" = local.kubernetes_psa_version
      "networking-role"                            = "ingress"
    }
  }

  depends_on = [aws_eks_access_policy_association.cluster_admins]
}

resource "helm_release" "ingress_nginx" {
  count = local.requires_ingress_nginx ? 1 : 0

  name            = "ingress-nginx"
  repository      = "https://kubernetes.github.io/ingress-nginx"
  chart           = "ingress-nginx"
  version         = "4.15.1"
  namespace       = kubernetes_namespace.ingress_nginx[0].metadata[0].name
  wait            = true
  timeout         = 900
  atomic          = true
  cleanup_on_fail = true

  set {
    name  = "controller.ingressClassResource.name"
    value = "nginx"
  }

  set {
    name  = "controller.ingressClass"
    value = "nginx"
  }

  depends_on = [
    helm_release.cilium,
    kubernetes_namespace.ingress_nginx,
  ]
}
