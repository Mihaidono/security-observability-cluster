resource "helm_release" "cilium" {
  name            = "cilium"
  repository      = "https://helm.cilium.io/"
  chart           = "cilium"
  namespace       = "kube-system"
  version         = "1.19.2"
  wait            = true
  timeout         = 900
  atomic          = true
  cleanup_on_fail = true

  set {
    name  = "cni.chainingMode"
    value = "aws-cni"
  }

  set {
    name  = "cni.exclusive"
    value = "false"
  }

  set {
    name  = "enableIPv4Masquerade"
    value = "false"
  }

  set {
    name  = "routingMode"
    value = "native"
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
}

resource "helm_release" "tetragon" {
  name            = "tetragon"
  repository      = "https://helm.cilium.io/"
  chart           = "tetragon"
  namespace       = "kube-system"
  version         = "1.6.1"
  wait            = true
  timeout         = 900
  atomic          = true
  cleanup_on_fail = true

  depends_on = [helm_release.cilium]
}

resource "kubernetes_namespace" "kyverno" {
  metadata {
    name = "kyverno"
    labels = {
      "pod-security.kubernetes.io/enforce"         = "baseline"
      "pod-security.kubernetes.io/enforce-version" = local.kubernetes_psa_version
      "observability-role"                         = "policy-engine"
    }
  }
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

  depends_on = [
    helm_release.cilium,
    kubernetes_namespace.kyverno,
  ]
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
}

resource "helm_release" "monitoring_agent" {
  name            = "lgtm"
  repository      = "https://grafana.github.io/helm-charts"
  chart           = "grafana-agent"
  version         = "0.44.2"
  namespace       = kubernetes_namespace.monitoring.metadata[0].name
  wait            = true
  timeout         = 900
  atomic          = true
  cleanup_on_fail = true

  set {
    name  = "fullnameOverride"
    value = "lgtm-agent"
  }

  depends_on = [
    helm_release.cilium,
    kubernetes_namespace.monitoring,
  ]
}

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
