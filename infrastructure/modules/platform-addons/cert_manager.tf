resource "kubernetes_namespace_v1" "cert_manager" {
  count = var.enable_cert_manager ? 1 : 0

  metadata {
    name = "cert-manager"
    labels = {
      "pod-security.kubernetes.io/enforce"         = "restricted"
      "pod-security.kubernetes.io/enforce-version" = local.kubernetes_psa_version
    }
  }

  depends_on = [terraform_data.platform_access_ready]
}

resource "helm_release" "cert_manager" {
  count = var.enable_cert_manager ? 1 : 0

  name            = "cert-manager"
  repository      = "https://charts.jetstack.io"
  chart           = "cert-manager"
  namespace       = kubernetes_namespace_v1.cert_manager[0].metadata[0].name
  version         = var.cert_manager_version
  wait            = true
  timeout         = 900
  atomic          = true
  cleanup_on_fail = true

  values = [yamlencode({
    # platform-prerequisites owns CRDs so custom resources can be planned on
    # the first platform run. Helm must not take ownership of the same CRDs.
    crds = { enabled = false }
    config = {
      apiVersion = "controller.config.cert-manager.io/v1alpha1"
      kind       = "ControllerConfiguration"
      gatewayAPI = { enabled = true }
    }
    enableCertificateOwnerRef = false
    resources = {
      requests = { cpu = "100m", memory = "128Mi" }
      limits   = { cpu = "500m", memory = "512Mi" }
    }
    webhook = {
      resources = {
        requests = { cpu = "50m", memory = "64Mi" }
        limits   = { cpu = "250m", memory = "128Mi" }
      }
    }
    cainjector = {
      resources = {
        requests = { cpu = "100m", memory = "128Mi" }
        limits   = { cpu = "500m", memory = "256Mi" }
      }
    }
    startupapicheck = {
      resources = {
        requests = { cpu = "10m", memory = "32Mi" }
        limits   = { cpu = "100m", memory = "64Mi" }
      }
    }
  })]

  depends_on = [
    helm_release.cilium,
    aws_eks_addon.coredns,
  ]
}
