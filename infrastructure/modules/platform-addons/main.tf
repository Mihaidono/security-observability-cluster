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

resource "kubernetes_namespace" "identity" {
  count = local.observability_identity_enabled ? 1 : 0

  metadata {
    name = local.identity_namespace
    labels = {
      "pod-security.kubernetes.io/enforce"         = "baseline"
      "pod-security.kubernetes.io/enforce-version" = local.kubernetes_psa_version
      "access-role"                                = "identity"
    }
  }
}

resource "random_password" "keycloak_admin_password" {
  count = local.observability_identity_enabled ? 1 : 0

  length           = 24
  special          = true
  override_special = "!@#%^*-_=+"
}

resource "random_password" "observability_demo_user_password" {
  count = local.observability_identity_enabled ? 1 : 0

  length           = 24
  special          = true
  override_special = "!@#%^*-_=+"
}

resource "random_password" "oauth2_proxy_client_secret" {
  count = local.observability_identity_enabled ? 1 : 0

  length  = 48
  special = false
}

resource "random_password" "oauth2_proxy_cookie_secret" {
  count = local.observability_identity_enabled ? 1 : 0

  length  = 32
  special = false
}

resource "kubernetes_secret" "observability_identity_bootstrap" {
  count = local.observability_identity_enabled ? 1 : 0

  metadata {
    name      = "observability-identity-bootstrap"
    namespace = kubernetes_namespace.identity[0].metadata[0].name
  }

  data = {
    "admin-password"     = random_password.keycloak_admin_password[0].result
    "client-id"          = local.oauth2_proxy_service_name
    "client-secret"      = random_password.oauth2_proxy_client_secret[0].result
    "cookie-secret"      = random_password.oauth2_proxy_cookie_secret[0].result
    "demo-user-password" = random_password.observability_demo_user_password[0].result
  }

  type = "Opaque"
}

resource "helm_release" "keycloak" {
  count = local.observability_identity_enabled ? 1 : 0

  name            = local.keycloak_service_name
  repository      = "oci://registry-1.docker.io/bitnamicharts"
  chart           = "keycloak"
  version         = "25.2.0"
  namespace       = kubernetes_namespace.identity[0].metadata[0].name
  wait            = true
  timeout         = 900
  atomic          = true
  cleanup_on_fail = true

  values = [
    yamlencode({
      production     = true
      httpEnabled    = true
      proxyHeaders   = "xforwarded"
      hostnameStrict = true
      image = {
        repository = "bitnamilegacy/keycloak"
        tag        = "26.3.3-debian-12-r0"
      }
      livenessProbe = {
        enabled             = true
        initialDelaySeconds = 240
        periodSeconds       = 10
        timeoutSeconds      = 5
        failureThreshold    = 6
        successThreshold    = 1
      }
      readinessProbe = {
        enabled             = true
        initialDelaySeconds = 45
        periodSeconds       = 10
        timeoutSeconds      = 5
        failureThreshold    = 12
        successThreshold    = 1
      }
      startupProbe = {
        enabled             = true
        initialDelaySeconds = 30
        periodSeconds       = 10
        timeoutSeconds      = 5
        failureThreshold    = 30
        successThreshold    = 1
      }
      auth = {
        adminUser         = "admin"
        existingSecret    = kubernetes_secret.observability_identity_bootstrap[0].metadata[0].name
        passwordSecretKey = "admin-password"
      }
      postgresql = {
        image = {
          repository = "bitnamilegacy/postgresql"
        }
        primary = {
          persistence = {
            enabled = false
          }
        }
      }
      ingress = {
        enabled          = true
        hostname         = var.keycloak_host
        ingressClassName = local.observability_ingress_class_name
        annotations      = local.keycloak_ingress_annotations
      }
      keycloakConfigCli = {
        enabled = true
        availabilityCheck = {
          enabled = true
          timeout = "300s"
        }
        image = {
          repository = "bitnamilegacy/keycloak-config-cli"
          tag        = "6.4.0-debian-12-r11"
        }
        extraEnvVars = [
          {
            name  = "IMPORT_VARSUBSTITUTION_ENABLED"
            value = "true"
          },
          {
            name = "OAUTH2_PROXY_CLIENT_SECRET"
            valueFrom = {
              secretKeyRef = {
                name = kubernetes_secret.observability_identity_bootstrap[0].metadata[0].name
                key  = "client-secret"
              }
            }
          },
          {
            name = "OBSERVABILITY_DEMO_USER_PASSWORD"
            valueFrom = {
              secretKeyRef = {
                name = kubernetes_secret.observability_identity_bootstrap[0].metadata[0].name
                key  = "demo-user-password"
              }
            }
          },
        ]
        configuration = {
          "${var.observability_realm_name}-realm.json" = jsonencode(local.observability_realm_configuration)
        }
      }
    }),
  ]

  depends_on = [
    helm_release.cilium,
    helm_release.ingress_nginx,
    kubernetes_namespace.identity,
    kubernetes_secret.observability_identity_bootstrap,
  ]
}

resource "helm_release" "oauth2_proxy" {
  count = local.observability_identity_enabled ? 1 : 0

  name            = local.oauth2_proxy_service_name
  repository      = "https://oauth2-proxy.github.io/manifests"
  chart           = "oauth2-proxy"
  version         = "10.6.0"
  namespace       = kubernetes_namespace.identity[0].metadata[0].name
  wait            = true
  timeout         = 900
  atomic          = true
  cleanup_on_fail = true

  values = [
    yamlencode({
      config = {
        existingSecret = kubernetes_secret.observability_identity_bootstrap[0].metadata[0].name
        emailDomains   = ["*"]
        upstreams      = ["static://202"]
      }
      ingress = {
        enabled     = true
        className   = local.observability_ingress_class_name
        path        = "/"
        pathType    = "Prefix"
        hosts       = [var.oauth2_proxy_host]
        annotations = local.oauth2_proxy_ingress_annotations
      }
      extraArgs = {
        provider                  = "oidc"
        reverse-proxy             = "true"
        redirect-url              = local.oauth2_proxy_redirect_url
        oidc-issuer-url           = local.keycloak_external_realm_base_url
        skip-oidc-discovery       = "true"
        login-url                 = "${local.keycloak_external_realm_base_url}/protocol/openid-connect/auth"
        redeem-url                = "${local.keycloak_internal_realm_base_url}/protocol/openid-connect/token"
        oidc-jwks-url             = "${local.keycloak_internal_realm_base_url}/protocol/openid-connect/certs"
        profile-url               = "${local.keycloak_internal_realm_base_url}/protocol/openid-connect/userinfo"
        allowed-group             = var.observability_allowed_group
        oidc-groups-claim         = "groups"
        scope                     = "openid profile email groups"
        cookie-domain             = ".lab.internal"
        cookie-secure             = "false"
        whitelist-domain          = ".lab.internal"
        set-xauthrequest          = "true"
        skip-provider-button      = "true"
        pass-authorization-header = "true"
      }
    }),
  ]

  depends_on = [
    helm_release.keycloak,
    helm_release.ingress_nginx,
    kubernetes_secret.observability_identity_bootstrap,
  ]
}

resource "kubernetes_ingress_v1" "hubble_ui" {
  count = local.hubble_ui_ingress_enabled ? 1 : 0

  metadata {
    name      = "hubble-ui"
    namespace = "kube-system"
    labels = {
      "app.kubernetes.io/managed-by" = "terraform"
      "app.kubernetes.io/name"       = "hubble-ui"
      "observability-role"           = "network-visibility"
    }
    annotations = local.hubble_ui_ingress_annotations
  }

  spec {
    ingress_class_name = var.hubble_ui_ingress_class_name

    rule {
      host = var.hubble_ui_host

      http {
        path {
          path      = "/"
          path_type = "Prefix"

          backend {
            service {
              name = "hubble-ui"

              port {
                number = 80
              }
            }
          }
        }
      }
    }
  }

  depends_on = [
    helm_release.cilium,
    helm_release.ingress_nginx,
    helm_release.oauth2_proxy,
  ]
}
