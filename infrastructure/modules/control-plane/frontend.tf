resource "kubernetes_service_v1" "frontend" {
  metadata {
    name      = var.frontend_service_name
    namespace = local.namespace_name
    labels    = local.frontend_labels
  }

  spec {
    type     = "ClusterIP"
    selector = local.frontend_labels

    port {
      name        = "http"
      port        = var.frontend_service_port
      target_port = var.frontend_container_port
      protocol    = "TCP"
    }
  }
}

resource "kubernetes_deployment_v1" "frontend" {
  metadata {
    name      = var.frontend_service_name
    namespace = local.namespace_name
    labels    = local.frontend_labels
  }

  spec {
    replicas = var.frontend_replicas

    selector {
      match_labels = local.frontend_labels
    }

    template {
      metadata {
        labels = local.frontend_labels
      }

      spec {
        security_context {
          seccomp_profile {
            type = "RuntimeDefault"
          }
        }

        container {
          name              = "frontend"
          image             = var.frontend_image
          image_pull_policy = var.frontend_image_pull_policy

          port {
            name           = "http"
            container_port = var.frontend_container_port
          }

          env {
            name  = "BACKEND_HOST"
            value = local.backend_service_fqdn
          }

          env {
            name  = "BACKEND_PORT"
            value = tostring(var.backend_service_port)
          }

          env {
            name  = "KEYCLOAK_HOST"
            value = local.keycloak_service_fqdn
          }

          env {
            name  = "KEYCLOAK_PORT"
            value = tostring(var.keycloak_service_port)
          }

          resources {
            requests = {
              cpu    = var.frontend_resources.requests_cpu
              memory = var.frontend_resources.requests_memory
            }
            limits = {
              cpu    = var.frontend_resources.limits_cpu
              memory = var.frontend_resources.limits_memory
            }
          }

          security_context {
            allow_privilege_escalation = false
            read_only_root_filesystem  = false
            run_as_non_root            = true

            capabilities {
              drop = ["ALL"]
            }
          }

          readiness_probe {
            http_get {
              path = "/"
              port = var.frontend_container_port
            }

            initial_delay_seconds = 5
            period_seconds        = 10
            timeout_seconds       = 3
            failure_threshold     = 6
            success_threshold     = 1
          }

          liveness_probe {
            http_get {
              path = "/"
              port = var.frontend_container_port
            }

            initial_delay_seconds = 15
            period_seconds        = 20
            timeout_seconds       = 3
            failure_threshold     = 6
            success_threshold     = 1
          }

          startup_probe {
            http_get {
              path = "/"
              port = var.frontend_container_port
            }

            initial_delay_seconds = 5
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
