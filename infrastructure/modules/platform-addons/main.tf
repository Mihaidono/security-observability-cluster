resource "helm_release" "cilium" {
  name            = "cilium"
  repository      = "https://helm.cilium.io/"
  chart           = "cilium"
  namespace       = "kube-system"
  version         = "1.19.5"
  wait            = true
  timeout         = 900
  atomic          = true
  cleanup_on_fail = true

  set {
    name  = "cluster.name"
    value = var.cluster_name
  }

  set {
    name  = "eni.enabled"
    value = "true"
  }

  set {
    name  = "eni.iamRole"
    value = var.cilium_operator_iam_role_arn
  }

  set {
    name  = "kubeProxyReplacement"
    value = "true"
  }

  set {
    name  = "routingMode"
    value = "native"
  }

  set {
    name  = "ipv4NativeRoutingCIDR"
    value = var.cluster_vpc_cidr
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

  set {
    name  = "resources.requests.cpu"
    value = "250m"
  }

  set {
    name  = "resources.requests.memory"
    value = "512Mi"
  }

  set {
    name  = "resources.limits.cpu"
    value = "1000m"
  }

  set {
    name  = "resources.limits.memory"
    value = "1Gi"
  }

  set {
    name  = "operator.resources.requests.cpu"
    value = "100m"
  }

  set {
    name  = "operator.resources.requests.memory"
    value = "128Mi"
  }

  set {
    name  = "operator.resources.limits.cpu"
    value = "500m"
  }

  set {
    name  = "operator.resources.limits.memory"
    value = "512Mi"
  }

  set {
    name  = "hubble.relay.resources.requests.cpu"
    value = "100m"
  }

  set {
    name  = "hubble.relay.resources.requests.memory"
    value = "128Mi"
  }

  set {
    name  = "hubble.relay.resources.limits.cpu"
    value = "500m"
  }

  set {
    name  = "hubble.relay.resources.limits.memory"
    value = "512Mi"
  }

  set {
    name  = "hubble.ui.backend.resources.requests.cpu"
    value = "100m"
  }

  set {
    name  = "hubble.ui.backend.resources.requests.memory"
    value = "128Mi"
  }

  set {
    name  = "hubble.ui.backend.resources.limits.cpu"
    value = "250m"
  }

  set {
    name  = "hubble.ui.backend.resources.limits.memory"
    value = "256Mi"
  }

  set {
    name  = "hubble.ui.frontend.resources.requests.cpu"
    value = "50m"
  }

  set {
    name  = "hubble.ui.frontend.resources.requests.memory"
    value = "64Mi"
  }

  set {
    name  = "hubble.ui.frontend.resources.limits.cpu"
    value = "250m"
  }

  set {
    name  = "hubble.ui.frontend.resources.limits.memory"
    value = "256Mi"
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

resource "kubernetes_namespace_v1" "kyverno" {
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
  namespace       = kubernetes_namespace_v1.kyverno.metadata[0].name
  wait            = true
  timeout         = 900
  atomic          = true
  cleanup_on_fail = true

  depends_on = [
    helm_release.cilium,
    kubernetes_namespace_v1.kyverno,
  ]
}

resource "kubernetes_namespace_v1" "monitoring" {
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
  namespace       = kubernetes_namespace_v1.monitoring.metadata[0].name
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
    kubernetes_namespace_v1.monitoring,
  ]
}

resource "kubernetes_namespace_v1" "ingress_nginx" {
  count = var.enable_ingress_nginx ? 1 : 0

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
  count = var.enable_ingress_nginx ? 1 : 0

  name            = "ingress-nginx"
  repository      = "https://kubernetes.github.io/ingress-nginx"
  chart           = "ingress-nginx"
  version         = "4.15.1"
  namespace       = kubernetes_namespace_v1.ingress_nginx[0].metadata[0].name
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
    kubernetes_namespace_v1.ingress_nginx,
  ]
}
