resource "kubernetes_secret_v1" "keycloak_runtime" {
  metadata {
    name      = "${var.keycloak_name}-runtime"
    namespace = local.namespace_name
    labels    = local.keycloak_labels
  }

  data = {
    KC_BOOTSTRAP_ADMIN_USERNAME       = var.keycloak_admin_username
    KC_BOOTSTRAP_ADMIN_PASSWORD       = var.keycloak_admin_password
    KC_DB                             = "postgres"
    KC_DB_URL_HOST                    = var.keycloak_database_host
    KC_DB_URL_PORT                    = tostring(var.keycloak_database_port)
    KC_DB_URL_DATABASE                = var.keycloak_database_name
    KC_DB_USERNAME                    = var.keycloak_database_username
    KC_DB_PASSWORD                    = var.keycloak_database_password
    KC_HTTP_ENABLED                   = "true"
    KC_HTTP_RELATIVE_PATH             = "/auth"
    KC_HEALTH_ENABLED                 = "true"
    KC_HTTP_MANAGEMENT_HEALTH_ENABLED = "false"
    KC_PROXY_HEADERS                  = "xforwarded"
  }

  type = "Opaque"
}

resource "kubernetes_secret_v1" "keycloak_database_bootstrap" {
  metadata {
    name      = "${var.keycloak_name}-database-bootstrap"
    namespace = local.namespace_name
    labels    = local.keycloak_labels
  }

  data = {
    PGHOST                     = var.keycloak_database_host
    PGPORT                     = tostring(var.keycloak_database_port)
    PGDATABASE                 = var.keycloak_database_admin_database
    PGUSER                     = var.keycloak_database_admin_username
    PGPASSWORD                 = var.keycloak_database_admin_password
    KEYCLOAK_DATABASE_NAME     = var.keycloak_database_name
    KEYCLOAK_DATABASE_USERNAME = var.keycloak_database_username
    KEYCLOAK_DATABASE_PASSWORD = var.keycloak_database_password
  }

  type = "Opaque"
}

resource "kubernetes_job_v1" "keycloak_database_bootstrap" {
  metadata {
    name      = "${var.keycloak_name}-database-bootstrap"
    namespace = local.namespace_name
    labels    = local.keycloak_labels
  }

  spec {
    backoff_limit              = 4
    ttl_seconds_after_finished = 600

    template {
      metadata {
        labels = local.keycloak_labels
      }

      spec {
        restart_policy = "Never"

        security_context {
          seccomp_profile {
            type = "RuntimeDefault"
          }
        }

        container {
          name  = "bootstrap"
          image = "postgres:16.9-alpine"
          command = [
            "/bin/sh",
            "-ec",
            <<-EOT
              if ! psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$${KEYCLOAK_DATABASE_USERNAME}'" | grep -q 1; then
                psql -c "CREATE ROLE \"$${KEYCLOAK_DATABASE_USERNAME}\" LOGIN PASSWORD '$${KEYCLOAK_DATABASE_PASSWORD}';"
              else
                psql -c "ALTER ROLE \"$${KEYCLOAK_DATABASE_USERNAME}\" WITH LOGIN PASSWORD '$${KEYCLOAK_DATABASE_PASSWORD}';"
              fi

              if ! psql -tAc "SELECT 1 FROM pg_database WHERE datname = '$${KEYCLOAK_DATABASE_NAME}'" | grep -q 1; then
                psql -c "CREATE DATABASE \"$${KEYCLOAK_DATABASE_NAME}\" OWNER \"$${KEYCLOAK_DATABASE_USERNAME}\";"
              else
                psql -c "ALTER DATABASE \"$${KEYCLOAK_DATABASE_NAME}\" OWNER TO \"$${KEYCLOAK_DATABASE_USERNAME}\";"
              fi
            EOT
          ]

          env_from {
            secret_ref {
              name = kubernetes_secret_v1.keycloak_database_bootstrap.metadata[0].name
            }
          }

          resources {
            requests = {
              cpu    = var.keycloak_database_bootstrap_resources.requests_cpu
              memory = var.keycloak_database_bootstrap_resources.requests_memory
            }
            limits = {
              cpu    = var.keycloak_database_bootstrap_resources.limits_cpu
              memory = var.keycloak_database_bootstrap_resources.limits_memory
            }
          }

          security_context {
            allow_privilege_escalation = false
            read_only_root_filesystem  = false
            run_as_non_root            = true
            run_as_user                = 999
            run_as_group               = 999

            capabilities {
              drop = ["ALL"]
            }
          }
        }
      }
    }
  }

  wait_for_completion = true
}

resource "kubernetes_service_v1" "keycloak" {
  metadata {
    name      = var.keycloak_name
    namespace = local.namespace_name
    labels    = local.keycloak_labels
  }

  spec {
    type     = "ClusterIP"
    selector = local.keycloak_labels

    port {
      name        = "http"
      port        = var.keycloak_service_port
      target_port = var.keycloak_container_port
      protocol    = "TCP"
    }
  }
}

resource "kubernetes_stateful_set_v1" "keycloak" {
  metadata {
    name      = var.keycloak_name
    namespace = local.namespace_name
    labels    = local.keycloak_labels
  }

  spec {
    service_name = kubernetes_service_v1.keycloak.metadata[0].name
    replicas     = 1

    selector {
      match_labels = local.keycloak_labels
    }

    template {
      metadata {
        labels = local.keycloak_labels
      }

      spec {
        security_context {
          fs_group = 1000

          seccomp_profile {
            type = "RuntimeDefault"
          }
        }

        container {
          name              = "keycloak"
          image             = var.keycloak_image
          image_pull_policy = var.keycloak_image_pull_policy
          args = [
            "start",
            "--http-enabled=true",
            "--http-relative-path=/auth",
            "--hostname-strict=false",
            "--proxy-headers=xforwarded",
          ]

          env_from {
            secret_ref {
              name = kubernetes_secret_v1.keycloak_runtime.metadata[0].name
            }
          }

          port {
            name           = "http"
            container_port = var.keycloak_container_port
          }

          resources {
            requests = {
              cpu    = var.keycloak_resources.requests_cpu
              memory = var.keycloak_resources.requests_memory
            }
            limits = {
              cpu    = var.keycloak_resources.limits_cpu
              memory = var.keycloak_resources.limits_memory
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
            http_get {
              path = "/auth/health/ready"
              port = var.keycloak_container_port
            }

            initial_delay_seconds = 20
            period_seconds        = 10
            timeout_seconds       = 5
            failure_threshold     = 12
            success_threshold     = 1
          }

          liveness_probe {
            http_get {
              path = "/auth/health/live"
              port = var.keycloak_container_port
            }

            initial_delay_seconds = 40
            period_seconds        = 20
            timeout_seconds       = 5
            failure_threshold     = 6
            success_threshold     = 1
          }

          startup_probe {
            http_get {
              path = "/auth/health/ready"
              port = var.keycloak_container_port
            }

            initial_delay_seconds = 20
            period_seconds        = 10
            timeout_seconds       = 5
            failure_threshold     = 30
            success_threshold     = 1
          }
        }
      }
    }
  }

  wait_for_rollout = true

  depends_on = [kubernetes_job_v1.keycloak_database_bootstrap]
}
