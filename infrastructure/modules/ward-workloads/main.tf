resource "kubernetes_config_map" "application_config" {
  for_each = local.applications_with_config_map

  metadata {
    name      = each.value.config_map.name
    namespace = each.value.namespace
    labels    = each.value.pod_labels
  }

  data = each.value.config_map.data
}

resource "kubernetes_deployment" "ward_application" {
  for_each = local.ward_applications

  metadata {
    name      = each.value.name
    namespace = each.value.namespace
    labels    = each.value.pod_labels
  }

  spec {
    replicas = each.value.replicas

    selector {
      match_labels = each.value.pod_labels
    }

    template {
      metadata {
        labels      = each.value.pod_labels
        annotations = each.value.pod_annotations
      }

      spec {
        automount_service_account_token = each.value.automount_service_account_token

        security_context {
          run_as_non_root = true
          run_as_user     = each.value.containers[0].security_context.run_as_user
          run_as_group    = each.value.containers[0].security_context.run_as_group
          fs_group        = each.value.containers[0].security_context.run_as_group

          seccomp_profile {
            type = "RuntimeDefault"
          }
        }

        dynamic "container" {
          for_each = each.value.containers
          content {
            name              = container.value.name
            image             = container.value.image
            image_pull_policy = container.value.image_pull_policy
            command           = container.value.command
            args              = container.value.args

            port {
              name           = container.value.name
              container_port = container.value.port
            }

            dynamic "env" {
              for_each = container.value.env
              content {
                name  = env.key
                value = env.value
              }
            }

            dynamic "env_from" {
              for_each = container.value.env_from_secret_names
              content {
                secret_ref {
                  name = env_from.value
                }
              }
            }

            resources {
              requests = {
                cpu    = container.value.resources.requests_cpu
                memory = container.value.resources.requests_memory
              }
              limits = {
                cpu    = container.value.resources.limits_cpu
                memory = container.value.resources.limits_memory
              }
            }

            security_context {
              allow_privilege_escalation = false
              run_as_non_root            = true
              read_only_root_filesystem  = container.value.security_context.read_only_root_filesystem
              run_as_user                = container.value.security_context.run_as_user
              run_as_group               = container.value.security_context.run_as_group

              capabilities {
                drop = ["ALL"]
              }
            }

            dynamic "readiness_probe" {
              for_each = container.value.probes.readiness.enabled ? [container.value.probes.readiness] : []
              content {
                http_get {
                  path = readiness_probe.value.path
                  port = readiness_probe.value.port
                }

                initial_delay_seconds = readiness_probe.value.initial_delay_seconds
                period_seconds        = readiness_probe.value.period_seconds
                timeout_seconds       = readiness_probe.value.timeout_seconds
                failure_threshold     = readiness_probe.value.failure_threshold
                success_threshold     = readiness_probe.value.success_threshold
              }
            }

            dynamic "liveness_probe" {
              for_each = container.value.probes.liveness.enabled ? [container.value.probes.liveness] : []
              content {
                http_get {
                  path = liveness_probe.value.path
                  port = liveness_probe.value.port
                }

                initial_delay_seconds = liveness_probe.value.initial_delay_seconds
                period_seconds        = liveness_probe.value.period_seconds
                timeout_seconds       = liveness_probe.value.timeout_seconds
                failure_threshold     = liveness_probe.value.failure_threshold
                success_threshold     = liveness_probe.value.success_threshold
              }
            }

            dynamic "startup_probe" {
              for_each = container.value.probes.startup.enabled ? [container.value.probes.startup] : []
              content {
                http_get {
                  path = startup_probe.value.path
                  port = startup_probe.value.port
                }

                initial_delay_seconds = startup_probe.value.initial_delay_seconds
                period_seconds        = startup_probe.value.period_seconds
                timeout_seconds       = startup_probe.value.timeout_seconds
                failure_threshold     = startup_probe.value.failure_threshold
                success_threshold     = startup_probe.value.success_threshold
              }
            }

            dynamic "volume_mount" {
              for_each = concat(
                container.value.volume_mounts,
                tonumber(container.key) == 0 && each.value.config_map.enabled ? [{
                  name       = "app-config"
                  mount_path = each.value.config_map.mount_path
                  sub_path   = null
                  read_only  = true
                }] : []
              )
              content {
                name       = volume_mount.value.name
                mount_path = volume_mount.value.mount_path
                sub_path   = volume_mount.value.sub_path
                read_only  = volume_mount.value.read_only
              }
            }
          }
        }

        dynamic "volume" {
          for_each = each.value.volumes
          content {
            name = volume.value.name

            dynamic "config_map" {
              for_each = volume.value.config_map_name != null ? [volume.value.config_map_name] : []
              content {
                name = config_map.value
              }
            }

            dynamic "secret" {
              for_each = volume.value.secret_name != null ? [volume.value.secret_name] : []
              content {
                secret_name = secret.value
              }
            }

            dynamic "empty_dir" {
              for_each = volume.value.empty_dir ? [true] : []
              content {}
            }
          }
        }
      }
    }
  }

  lifecycle {
    precondition {
      condition     = contains(var.analysis_subject_names, each.value.namespace)
      error_message = "Application ${each.value.name} targets namespace ${each.value.namespace}, but that ward is not defined in analysis_subjects."
    }

    precondition {
      condition     = length(each.value.containers) > 0
      error_message = "Application ${each.value.name} must define either container or containers."
    }
  }
}

resource "kubernetes_service" "ward_application" {
  for_each = local.applications_with_service

  metadata {
    name        = each.value.service.name
    namespace   = each.value.namespace
    labels      = each.value.pod_labels
    annotations = each.value.service.annotations
  }

  spec {
    selector = each.value.pod_labels
    type     = each.value.service.type

    port {
      name        = "app"
      port        = each.value.service.port
      target_port = each.value.service.target_port
      protocol    = "TCP"
    }
  }
}

resource "kubernetes_network_policy" "allow_same_namespace_ingress" {
  for_each = local.applications_with_same_namespace_ingress

  metadata {
    name      = "allow-${each.value.name}-from-same-namespace"
    namespace = each.value.namespace
  }

  spec {
    pod_selector {
      match_labels = each.value.pod_labels
    }

    policy_types = ["Ingress"]

    ingress {
      from {
        pod_selector {}
      }

      ports {
        port     = each.value.service.target_port
        protocol = "TCP"
      }
    }
  }
}

resource "kubernetes_network_policy" "application_ingress_allowlist" {
  for_each = local.applications_with_ingress_allowlists

  metadata {
    name      = "allow-${each.value.name}-ingress-allowlist"
    namespace = each.value.namespace
  }

  spec {
    pod_selector {
      match_labels = each.value.pod_labels
    }

    policy_types = ["Ingress"]

    dynamic "ingress" {
      for_each = each.value.network_policy.ingress
      content {
        dynamic "from" {
          for_each = ingress.value.from
          content {
            dynamic "pod_selector" {
              for_each = length(keys(from.value.pod_selector)) > 0 ? [from.value.pod_selector] : []
              content {
                match_labels = pod_selector.value
              }
            }

            dynamic "namespace_selector" {
              for_each = length(keys(from.value.namespace_selector)) > 0 ? [from.value.namespace_selector] : []
              content {
                match_labels = namespace_selector.value
              }
            }

            dynamic "ip_block" {
              for_each = from.value.ip_block != null ? [from.value.ip_block] : []
              content {
                cidr   = ip_block.value.cidr
                except = ip_block.value.except
              }
            }
          }
        }

        dynamic "ports" {
          for_each = ingress.value.ports
          content {
            port     = ports.value.port
            protocol = ports.value.protocol
          }
        }
      }
    }
  }
}

resource "kubernetes_network_policy" "application_egress_allowlist" {
  for_each = local.applications_with_egress_allowlists

  metadata {
    name      = "allow-${each.value.name}-egress-allowlist"
    namespace = each.value.namespace
  }

  spec {
    pod_selector {
      match_labels = each.value.pod_labels
    }

    policy_types = ["Egress"]

    dynamic "egress" {
      for_each = each.value.network_policy.egress
      content {
        dynamic "to" {
          for_each = egress.value.to
          content {
            dynamic "pod_selector" {
              for_each = length(keys(to.value.pod_selector)) > 0 ? [to.value.pod_selector] : []
              content {
                match_labels = pod_selector.value
              }
            }

            dynamic "namespace_selector" {
              for_each = length(keys(to.value.namespace_selector)) > 0 ? [to.value.namespace_selector] : []
              content {
                match_labels = namespace_selector.value
              }
            }

            dynamic "ip_block" {
              for_each = to.value.ip_block != null ? [to.value.ip_block] : []
              content {
                cidr   = ip_block.value.cidr
                except = ip_block.value.except
              }
            }
          }
        }

        dynamic "ports" {
          for_each = egress.value.ports
          content {
            port     = ports.value.port
            protocol = ports.value.protocol
          }
        }
      }
    }
  }
}

resource "kubernetes_ingress_v1" "ward_application" {
  for_each = local.applications_with_ingress

  metadata {
    name        = "${each.value.name}-ingress"
    namespace   = each.value.namespace
    labels      = each.value.pod_labels
    annotations = each.value.ingress.annotations
  }

  spec {
    ingress_class_name = each.value.ingress.class_name

    dynamic "tls" {
      for_each = each.value.ingress.tls_secret_name != null ? [each.value.ingress.tls_secret_name] : []
      content {
        hosts       = each.value.ingress.host != null ? [each.value.ingress.host] : []
        secret_name = tls.value
      }
    }

    rule {
      host = each.value.ingress.host

      http {
        path {
          path      = each.value.ingress.path
          path_type = each.value.ingress.path_type

          backend {
            service {
              name = kubernetes_service.ward_application[each.key].metadata[0].name

              port {
                number = each.value.service.port
              }
            }
          }
        }
      }
    }
  }
}
