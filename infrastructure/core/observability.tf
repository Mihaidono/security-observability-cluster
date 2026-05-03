resource "helm_release" "cilium" {
  name       = "cilium"
  repository = "https://helm.cilium.io/"
  chart      = "cilium"
  namespace  = "kube-system"
  version    = "1.19.2"
  wait       = true
  timeout    = 900

  set {
    name  = "eni.enabled"
    value = "true"
  }

  set {
    name  = "ipam.mode"
    value = "eni"
  }

  set {
    name  = "egressGateway.enabled"
    value = "true"
  }

  set {
    name  = "hubble.enabled"
    value = "true"
  }

  set {
    name  = "hubble.relay.enabled"
    value = "true"
  }

  set {
    name  = "hubble.ui.enabled"
    value = "true"
  }

  set {
    name  = "operator.replicas"
    value = "1"
  }

  depends_on = [aws_eks_access_policy_association.cluster_admins]
}

resource "helm_release" "tetragon" {
  name       = "tetragon"
  repository = "https://helm.cilium.io/"
  chart      = "tetragon"
  namespace  = "kube-system"
  version    = "1.6.1"
  wait       = true
  timeout    = 900

  depends_on = [helm_release.cilium]
}

resource "kubernetes_namespace" "monitoring" {
  metadata {
    name = "monitoring-zone"
    labels = {
      "pod-security.kubernetes.io/enforce"         = "baseline"
      "pod-security.kubernetes.io/enforce-version" = local.kubernetes_psa_version
      "observability-role"                         = "platform"
    }
  }

  depends_on = [aws_eks_access_policy_association.cluster_admins]
}

resource "helm_release" "lgtm_stack" {
  name       = "lgtm"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "grafana-agent"
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
  wait       = true
  timeout    = 900

  set {
    name  = "fullnameOverride"
    value = "lgtm-agent"
  }

  depends_on = [
    helm_release.cilium,
    kubernetes_namespace.monitoring,
  ]
}
