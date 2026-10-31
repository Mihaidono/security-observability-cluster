resource "kubernetes_manifest" "control_plane_gateway" {
  count = local.control_plane_public_gateway_enabled ? 1 : 0

  manifest = {
    apiVersion = "gateway.networking.k8s.io/v1"
    kind       = "Gateway"
    metadata = {
      name      = local.control_plane_gateway_name
      namespace = var.control_plane_namespace
      labels = {
        "app.kubernetes.io/name"       = local.control_plane_gateway_name
        "app.kubernetes.io/component"  = "public-entrypoint"
        "app.kubernetes.io/managed-by" = "terraform"
        "isolens.io/gateway-provider"  = "cilium"
        "isolens.io/exposure-scope"    = "control-plane"
      }
    }
    spec = {
      gatewayClassName = "cilium"
      listeners = concat([
        {
          name     = "https"
          protocol = "HTTPS"
          port     = 443
          hostname = var.control_plane_public_hostname
          tls = {
            mode = "Terminate"
            certificateRefs = [
              {
                name = var.control_plane_public_tls_secret_name
              }
            ]
          }
          allowedRoutes = {
            kinds = [{ group = "gateway.networking.k8s.io", kind = "HTTPRoute" }]
            namespaces = {
              from = "Same"
            }
          }
        }
        ], var.control_plane_manage_tls ? [
        {
          name     = "acme-http"
          protocol = "HTTP"
          port     = 80
          hostname = var.control_plane_public_hostname
          allowedRoutes = {
            kinds = [{ group = "gateway.networking.k8s.io", kind = "HTTPRoute" }]
            namespaces = {
              from = "Same"
            }
          }
        }
      ] : [])
    }
  }

  # Wait for the controller instead of assuming AWS provisioning finishes in 120s.
  wait {
    fields = {
      "status.addresses[0].value" = ".+"
    }
  }

  timeouts {
    create = "20m"
    update = "20m"
  }

  depends_on = [
    module.addons,
    module.control_plane,
  ]
}

resource "kubernetes_manifest" "control_plane_frontend_route" {
  count = local.control_plane_public_gateway_enabled ? 1 : 0

  manifest = {
    apiVersion = "gateway.networking.k8s.io/v1"
    kind       = "HTTPRoute"
    metadata = {
      name      = "${local.control_plane_gateway_name}-frontend"
      namespace = var.control_plane_namespace
      labels = {
        "app.kubernetes.io/name"       = module.control_plane.frontend_service_name
        "app.kubernetes.io/component"  = "public-route"
        "app.kubernetes.io/managed-by" = "terraform"
        "isolens.io/gateway-provider"  = "cilium"
        "isolens.io/exposure-scope"    = "control-plane"
      }
    }
    spec = {
      hostnames = [var.control_plane_public_hostname]
      parentRefs = [
        {
          name        = local.control_plane_gateway_name
          sectionName = "https"
        }
      ]
      rules = [
        {
          backendRefs = [
            {
              name = module.control_plane.frontend_service_name
              port = var.control_plane_frontend_service_port
            }
          ]
        }
      ]
    }
  }

  depends_on = [kubernetes_manifest.control_plane_gateway]
}

resource "kubernetes_manifest" "shared_applications_gateway" {
  count = var.enable_shared_applications_gateway ? 1 : 0

  manifest = {
    apiVersion = "gateway.networking.k8s.io/v1"
    kind       = "Gateway"
    metadata = {
      name      = local.applications_gateway_name
      namespace = local.applications_gateway_namespace
      labels = {
        "app.kubernetes.io/name"       = local.applications_gateway_name
        "app.kubernetes.io/component"  = "shared-entrypoint"
        "app.kubernetes.io/managed-by" = "terraform"
        "isolens.io/gateway-provider"  = "cilium"
        "isolens.io/exposure-scope"    = "applications"
      }
    }
    spec = {
      gatewayClassName = "cilium"
      listeners = [
        {
          name     = "http"
          protocol = "HTTP"
          port     = 80
          allowedRoutes = {
            namespaces = {
              from = "All"
            }
          }
        }
      ]
    }
  }

  depends_on = [module.addons]
}

data "kubernetes_service_v1" "control_plane_gateway" {
  count = local.control_plane_public_gateway_enabled ? 1 : 0

  metadata {
    name      = local.control_plane_gateway_service_name
    namespace = var.control_plane_namespace
  }

  depends_on = [kubernetes_manifest.control_plane_gateway]
}

resource "aws_route53_record" "control_plane_frontend" {
  count = local.control_plane_public_gateway_enabled && var.control_plane_route53_zone_id != "" ? 1 : 0

  zone_id = var.control_plane_route53_zone_id
  name    = var.control_plane_public_hostname
  type    = "CNAME"
  ttl     = var.control_plane_route53_record_ttl
  records = [data.kubernetes_service_v1.control_plane_gateway[0].status[0].load_balancer[0].ingress[0].hostname]
}
