resource "kubernetes_secret_v1" "credentials" {
  metadata {
    name      = "${var.name}-credentials"
    namespace = var.namespace
    labels    = local.labels
  }

  data = {
    POSTGRES_DB       = var.database_name
    POSTGRES_USER     = var.username
    POSTGRES_PASSWORD = var.password
  }

  type = "Opaque"
}

resource "kubernetes_service_v1" "postgresql" {
  metadata {
    name      = var.name
    namespace = var.namespace
    labels    = local.labels
  }

  spec {
    selector = local.labels

    port {
      name        = "postgresql"
      port        = var.service_port
      target_port = var.service_port
      protocol    = "TCP"
    }
  }
}

resource "kubernetes_stateful_set_v1" "postgresql" {
  metadata {
    name      = var.name
    namespace = var.namespace
    labels    = local.labels
  }

  spec {
    replicas     = 1
    service_name = kubernetes_service_v1.postgresql.metadata[0].name

    selector {
      match_labels = local.labels
    }

    template {
      metadata {
        labels = local.labels
      }

      spec {
        security_context {
          fs_group = 999

          seccomp_profile {
            type = "RuntimeDefault"
          }
        }

        container {
          name              = "postgresql"
          image             = var.image
          image_pull_policy = "IfNotPresent"

          port {
            name           = "postgresql"
            container_port = var.service_port
          }

          env_from {
            secret_ref {
              name = kubernetes_secret_v1.credentials.metadata[0].name
            }
          }

          resources {
            requests = {
              cpu    = var.resources.requests_cpu
              memory = var.resources.requests_memory
            }
            limits = {
              cpu    = var.resources.limits_cpu
              memory = var.resources.limits_memory
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

          readiness_probe {
            exec {
              command = ["/bin/sh", "-c", "pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -h 127.0.0.1"]
            }

            initial_delay_seconds = 10
            period_seconds        = 10
            timeout_seconds       = 5
            failure_threshold     = 6
            success_threshold     = 1
          }

          liveness_probe {
            exec {
              command = ["/bin/sh", "-c", "pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -h 127.0.0.1"]
            }

            initial_delay_seconds = 20
            period_seconds        = 20
            timeout_seconds       = 5
            failure_threshold     = 6
            success_threshold     = 1
          }

          startup_probe {
            exec {
              command = ["/bin/sh", "-c", "pg_isready -U \"$POSTGRES_USER\" -d \"$POSTGRES_DB\" -h 127.0.0.1"]
            }

            initial_delay_seconds = 10
            period_seconds        = 10
            timeout_seconds       = 5
            failure_threshold     = 18
            success_threshold     = 1
          }

          volume_mount {
            name       = "data"
            mount_path = "/var/lib/postgresql/data"
          }
        }
      }
    }

    volume_claim_template {
      metadata {
        name = "data"
      }

      spec {
        access_modes       = ["ReadWriteOnce"]
        storage_class_name = var.storage_class_name

        resources {
          requests = {
            storage = var.storage_size
          }
        }
      }
    }
  }

  wait_for_rollout = true
}

resource "kubernetes_network_policy" "allow_same_namespace_ingress" {
  metadata {
    name      = "allow-${var.name}-same-namespace"
    namespace = var.namespace
  }

  spec {
    pod_selector {
      match_labels = local.labels
    }

    policy_types = ["Ingress"]

    ingress {
      from {
        pod_selector {}
      }

      ports {
        port     = var.service_port
        protocol = "TCP"
      }
    }
  }
}
