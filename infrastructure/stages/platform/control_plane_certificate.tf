resource "kubernetes_manifest" "control_plane_acme_issuer" {
  count = var.control_plane_manage_tls ? 1 : 0

  manifest = {
    apiVersion = "cert-manager.io/v1"
    kind       = "Issuer"
    metadata = {
      name      = local.control_plane_acme_issuer_name
      namespace = var.control_plane_namespace
    }
    spec = {
      acme = merge({
        server = var.control_plane_acme_server
        privateKeySecretRef = {
          name = "${local.control_plane_acme_issuer_name}-account"
        }
        solvers = [{
          selector = {
            dnsNames = [var.control_plane_public_hostname]
          }
          http01 = {
            gatewayHTTPRoute = {
              serviceType = "ClusterIP"
              parentRefs = [{
                group       = "gateway.networking.k8s.io"
                kind        = "Gateway"
                name        = local.control_plane_gateway_name
                namespace   = var.control_plane_namespace
                sectionName = "acme-http"
              }]
              podTemplate = {
                spec = {
                  resources = {
                    requests = { cpu = "10m", memory = "32Mi" }
                    limits   = { cpu = "100m", memory = "64Mi" }
                  }
                }
              }
            }
          }
        }]
      }, var.control_plane_acme_email == "" ? {} : { email = var.control_plane_acme_email })
    }
  }

  depends_on = [
    module.addons,
    kubernetes_manifest.control_plane_gateway,
  ]
}

resource "kubernetes_manifest" "control_plane_certificate" {
  count = var.control_plane_manage_tls ? 1 : 0

  manifest = {
    apiVersion = "cert-manager.io/v1"
    kind       = "Certificate"
    metadata = {
      name      = "${local.control_plane_gateway_name}-tls"
      namespace = var.control_plane_namespace
    }
    spec = {
      secretName = var.control_plane_public_tls_secret_name
      dnsNames   = [var.control_plane_public_hostname]
      issuerRef = {
        group = "cert-manager.io"
        kind  = "Issuer"
        name  = local.control_plane_acme_issuer_name
      }
      privateKey = {
        algorithm      = "RSA"
        size           = 2048
        rotationPolicy = "Always"
      }
      renewBeforePercentage = 33
    }
  }

  # Do not wait for Ready here: the first apply must return the load balancer
  # target before the operator can create the cross-account CNAME. cert-manager
  # retries HTTP-01 and finishes issuance once public DNS resolves correctly.
  depends_on = [kubernetes_manifest.control_plane_acme_issuer]
}
