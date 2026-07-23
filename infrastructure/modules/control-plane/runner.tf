resource "kubernetes_deployment_v1" "runner" {
  metadata {
    name      = var.runner_name
    namespace = local.namespace_name
    labels    = local.runner_labels
  }

  spec {
    replicas = var.runner_replicas

    selector {
      match_labels = local.runner_labels
    }

    template {
      metadata {
        labels = local.runner_labels
      }

      spec {
        security_context {
          fs_group = 1000

          seccomp_profile {
            type = "RuntimeDefault"
          }
        }

        container {
          name              = "runner"
          image             = var.backend_image
          image_pull_policy = var.backend_image_pull_policy
          command           = ["python", "-m", "app.runner_main"]

          env_from {
            secret_ref {
              name = kubernetes_secret_v1.backend_runtime.metadata[0].name
            }
          }

          resources {
            requests = {
              cpu    = var.runner_resources.requests_cpu
              memory = var.runner_resources.requests_memory
            }
            limits = {
              cpu    = var.runner_resources.limits_cpu
              memory = var.runner_resources.limits_memory
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
        }
      }
    }
  }

  wait_for_rollout = true
}
