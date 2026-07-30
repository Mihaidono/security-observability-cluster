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

resource "kubernetes_secret_v1" "keycloak_realm_bootstrap" {
  count = var.keycloak_bootstrap_realm ? 1 : 0

  metadata {
    name      = "${var.keycloak_name}-realm-bootstrap"
    namespace = local.namespace_name
    labels    = local.keycloak_labels
  }

  data = {
    KEYCLOAK_BASE_URL       = "http://${local.keycloak_service_fqdn}:${var.keycloak_service_port}/auth"
    KEYCLOAK_ADMIN_USERNAME = var.keycloak_admin_username
    KEYCLOAK_ADMIN_PASSWORD = var.keycloak_admin_password
    KEYCLOAK_REALM          = var.keycloak_realm
    KEYCLOAK_CLIENT_ID      = var.keycloak_client_id
    KEYCLOAK_CLIENT_SECRET  = var.keycloak_client_secret
    KEYCLOAK_PUBLIC_APP_URL = trimsuffix(var.public_app_url, "/")
  }

  type = "Opaque"
}

resource "kubernetes_config_map_v1" "keycloak_theme" {
  metadata {
    name      = "${var.keycloak_name}-theme"
    namespace = local.namespace_name
    labels    = local.keycloak_labels
  }

  data = {
    "theme.properties" = file("${path.module}/../../../docker/keycloak-theme/isolens/login/theme.properties")
    "isolens.css"      = file("${path.module}/../../../docker/keycloak-theme/isolens/login/resources/css/isolens.css")
    "isolens-theme.js" = file("${path.module}/../../../docker/keycloak-theme/isolens/login/resources/js/isolens-theme.js")
  }

  binary_data = {
    "isolens-graphic.png" = filebase64("${path.module}/../../../docker/keycloak-theme/isolens/login/resources/img/isolens-graphic.png")
    "favicon.png"         = filebase64("${path.module}/../../../docker/keycloak-theme/isolens/login/resources/img/favicon.png")
  }
}

resource "kubernetes_config_map_v1" "keycloak_database_bootstrap_script" {
  metadata {
    name      = "${var.keycloak_name}-database-bootstrap-script"
    namespace = local.namespace_name
    labels    = local.keycloak_labels
  }

  data = {
    "bootstrap.sh" = file("${path.root}/../../scripts/keycloak-database-bootstrap.sh")
  }
}

resource "kubernetes_config_map_v1" "keycloak_realm_bootstrap_script" {
  count = var.keycloak_bootstrap_realm ? 1 : 0

  metadata {
    name      = "${var.keycloak_name}-realm-bootstrap-script"
    namespace = local.namespace_name
    labels    = local.keycloak_labels
  }

  data = {
    "bootstrap.py" = file("${path.root}/../../scripts/keycloak-realm-bootstrap.py")
  }
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
            "/bootstrap/bootstrap.sh",
          ]

          env_from {
            secret_ref {
              name = kubernetes_secret_v1.keycloak_database_bootstrap.metadata[0].name
            }
          }

          volume_mount {
            name       = "bootstrap-script"
            mount_path = "/bootstrap"
            read_only  = true
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

        volume {
          name = "bootstrap-script"

          config_map {
            name = kubernetes_config_map_v1.keycloak_database_bootstrap_script.metadata[0].name
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
        annotations = {
          "isolens.io/keycloak-theme-checksum" = sha256(join("", [
            file("${path.module}/../../../docker/keycloak-theme/isolens/login/theme.properties"),
            file("${path.module}/../../../docker/keycloak-theme/isolens/login/resources/css/isolens.css"),
            filebase64("${path.module}/../../../docker/keycloak-theme/isolens/login/resources/js/isolens-theme.js"),
            filebase64("${path.module}/../../../docker/keycloak-theme/isolens/login/resources/img/isolens-graphic.png"),
            filebase64("${path.module}/../../../docker/keycloak-theme/isolens/login/resources/img/favicon.png"),
          ]))
        }
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

          volume_mount {
            name       = "keycloak-theme"
            mount_path = "/opt/keycloak/themes/isolens"
            read_only  = true
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

        volume {
          name = "keycloak-theme"

          config_map {
            name = kubernetes_config_map_v1.keycloak_theme.metadata[0].name

            items {
              key  = "theme.properties"
              path = "login/theme.properties"
            }

            items {
              key  = "isolens.css"
              path = "login/resources/css/isolens.css"
            }

            items {
              key  = "isolens-theme.js"
              path = "login/resources/js/isolens-theme.js"
            }

            items {
              key  = "isolens-graphic.png"
              path = "login/resources/img/isolens-graphic.png"
            }

            items {
              key  = "favicon.png"
              path = "login/resources/img/favicon.png"
            }
          }
        }
      }
    }
  }

  wait_for_rollout = true

  depends_on = [kubernetes_job_v1.keycloak_database_bootstrap]
}

resource "kubernetes_job_v1" "keycloak_realm_bootstrap" {
  count = var.keycloak_bootstrap_realm ? 1 : 0

  metadata {
    name      = "${var.keycloak_name}-realm-bootstrap"
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
          image = "python:3.12-alpine"
          command = [
            "python",
            "/bootstrap/bootstrap.py",
          ]

          env_from {
            secret_ref {
              name = kubernetes_secret_v1.keycloak_realm_bootstrap[0].metadata[0].name
            }
          }

          volume_mount {
            name       = "bootstrap-script"
            mount_path = "/bootstrap"
            read_only  = true
          }

          resources {
            requests = {
              cpu    = var.keycloak_realm_bootstrap_resources.requests_cpu
              memory = var.keycloak_realm_bootstrap_resources.requests_memory
            }
            limits = {
              cpu    = var.keycloak_realm_bootstrap_resources.limits_cpu
              memory = var.keycloak_realm_bootstrap_resources.limits_memory
            }
          }

          security_context {
            allow_privilege_escalation = false
            read_only_root_filesystem  = false
            run_as_non_root            = true
            run_as_user                = 65532
            run_as_group               = 65532

            capabilities {
              drop = ["ALL"]
            }
          }
        }

        volume {
          name = "bootstrap-script"

          config_map {
            name = kubernetes_config_map_v1.keycloak_realm_bootstrap_script[0].metadata[0].name
          }
        }
      }
    }
  }

  wait_for_completion = true

  depends_on = [kubernetes_stateful_set_v1.keycloak]
}
