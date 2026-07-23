resource "kubernetes_secret_v1" "backend_runtime" {
  metadata {
    name      = "${var.backend_service_name}-runtime"
    namespace = local.namespace_name
    labels    = local.backend_labels
  }

  data = {
    ISOLENS_DATABASE_URL           = var.backend_database_url
    ISOLENS_PUBLIC_APP_URL         = var.public_app_url
    ISOLENS_OIDC_INTERNAL_BASE_URL = "http://${local.keycloak_service_fqdn}:${var.keycloak_service_port}/auth"
    ISOLENS_OIDC_REALM             = var.keycloak_realm
    ISOLENS_OIDC_CLIENT_ID         = var.keycloak_client_id
    ISOLENS_OIDC_CLIENT_SECRET     = var.keycloak_client_secret
    ISOLENS_SESSION_COOKIE_SECURE  = tostring(var.session_cookie_secure)
  }

  type = "Opaque"
}

resource "kubernetes_service_v1" "backend" {
  metadata {
    name      = var.backend_service_name
    namespace = local.namespace_name
    labels    = local.backend_labels
  }

  spec {
    type     = "ClusterIP"
    selector = local.backend_labels

    port {
      name        = "http"
      port        = var.backend_service_port
      target_port = var.backend_container_port
      protocol    = "TCP"
    }
  }
}

resource "kubernetes_deployment_v1" "backend" {
  metadata {
    name      = var.backend_service_name
    namespace = local.namespace_name
    labels    = local.backend_labels
  }

  spec {
    replicas = var.backend_replicas

    selector {
      match_labels = local.backend_labels
    }

    template {
      metadata {
        labels = local.backend_labels
      }

      spec {
        security_context {
          fs_group = 1000

          seccomp_profile {
            type = "RuntimeDefault"
          }
        }

        container {
          name              = "backend"
          image             = var.backend_image
          image_pull_policy = var.backend_image_pull_policy

          port {
            name           = "http"
            container_port = var.backend_container_port
          }

          env_from {
            secret_ref {
              name = kubernetes_secret_v1.backend_runtime.metadata[0].name
            }
          }

          resources {
            requests = {
              cpu    = var.backend_resources.requests_cpu
              memory = var.backend_resources.requests_memory
            }
            limits = {
              cpu    = var.backend_resources.limits_cpu
              memory = var.backend_resources.limits_memory
            }
          }

          security_context {
            allow_privilege_escalation = false
            read_only_root_filesystem  = false
            run_as_non_root            = true
            run_as_user                = 1000
            run_as_group               = 1000

            capabilities {
              drop = ["ALL"]
            }
          }

          readiness_probe {
            tcp_socket {
              port = var.backend_container_port
            }

            initial_delay_seconds = 10
            period_seconds        = 10
            timeout_seconds       = 3
            failure_threshold     = 6
            success_threshold     = 1
          }

          liveness_probe {
            tcp_socket {
              port = var.backend_container_port
            }

            initial_delay_seconds = 20
            period_seconds        = 20
            timeout_seconds       = 3
            failure_threshold     = 6
            success_threshold     = 1
          }

          startup_probe {
            tcp_socket {
              port = var.backend_container_port
            }

            initial_delay_seconds = 10
            period_seconds        = 10
            timeout_seconds       = 3
            failure_threshold     = 18
            success_threshold     = 1
          }
        }
      }
    }
  }

  wait_for_rollout = true
}
