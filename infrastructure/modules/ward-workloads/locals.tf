locals {
  ward_applications = {
    for app in var.ward_applications : app.name => {
      name      = app.name
      namespace = app.namespace
      replicas  = try(app.replicas, 1)
      pod_labels = merge({
        "app.kubernetes.io/name"       = app.name
        "app.kubernetes.io/component"  = "analysis-subject"
        "app.kubernetes.io/managed-by" = "terraform"
        "isolens.io/application"       = app.name
        "isolens.io/subject"           = app.namespace
      }, try(app.pod_labels, {}))
      pod_annotations                 = try(app.pod_annotations, {})
      automount_service_account_token = try(app.automount_service_account_token, false)
      allow_same_namespace_ingress    = try(app.allow_same_namespace_ingress, true)
      service = {
        enabled     = try(app.service.enabled, true)
        name        = coalesce(try(app.service.name, null), "${app.name}-svc")
        type        = coalesce(try(app.service.type, null), "ClusterIP")
        port        = coalesce(try(app.service.port, null), try(app.containers[0].port, null), try(app.container.port, null), 8080)
        target_port = coalesce(try(app.service.target_port, null), try(app.containers[0].port, null), try(app.container.port, null), 8080)
        annotations = coalesce(try(app.service.annotations, null), {})
      }
      containers = [
        for container in(
          length(try(app.containers, [])) > 0 ? app.containers : (
            try(app.container.image, null) != null ? [app.container] : []
          )
          ) : {
          name                  = coalesce(try(container.name, null), "app")
          image                 = container.image
          image_pull_policy     = coalesce(try(container.image_pull_policy, null), "IfNotPresent")
          command               = coalesce(try(container.command, null), [])
          args                  = coalesce(try(container.args, null), [])
          port                  = coalesce(try(container.port, null), 8080)
          env                   = coalesce(try(container.env, null), {})
          env_from_secret_names = coalesce(try(container.env_from_secret_names, null), [])
          volume_mounts = [
            for mount in coalesce(try(container.volume_mounts, null), []) : {
              name       = mount.name
              mount_path = mount.mount_path
              sub_path   = try(mount.sub_path, null)
              read_only  = coalesce(try(mount.read_only, null), true)
            }
          ]
          resources = {
            requests_cpu    = coalesce(try(container.resources.requests_cpu, null), "100m")
            requests_memory = coalesce(try(container.resources.requests_memory, null), "128Mi")
            limits_cpu      = coalesce(try(container.resources.limits_cpu, null), "500m")
            limits_memory   = coalesce(try(container.resources.limits_memory, null), "256Mi")
          }
          security_context = {
            run_as_user               = coalesce(try(container.security_context.run_as_user, null), 101)
            run_as_group              = coalesce(try(container.security_context.run_as_group, null), 101)
            read_only_root_filesystem = coalesce(try(container.security_context.read_only_root_filesystem, null), false)
          }
          probes = {
            readiness = {
              enabled               = coalesce(try(container.probes.readiness.enabled, null), false)
              path                  = coalesce(try(container.probes.readiness.path, null), "/")
              port                  = coalesce(try(container.probes.readiness.port, null), coalesce(try(container.port, null), 8080))
              initial_delay_seconds = coalesce(try(container.probes.readiness.initial_delay_seconds, null), 5)
              period_seconds        = coalesce(try(container.probes.readiness.period_seconds, null), 10)
              timeout_seconds       = coalesce(try(container.probes.readiness.timeout_seconds, null), 1)
              failure_threshold     = coalesce(try(container.probes.readiness.failure_threshold, null), 3)
              success_threshold     = coalesce(try(container.probes.readiness.success_threshold, null), 1)
            }
            liveness = {
              enabled               = coalesce(try(container.probes.liveness.enabled, null), false)
              path                  = coalesce(try(container.probes.liveness.path, null), "/")
              port                  = coalesce(try(container.probes.liveness.port, null), coalesce(try(container.port, null), 8080))
              initial_delay_seconds = coalesce(try(container.probes.liveness.initial_delay_seconds, null), 15)
              period_seconds        = coalesce(try(container.probes.liveness.period_seconds, null), 20)
              timeout_seconds       = coalesce(try(container.probes.liveness.timeout_seconds, null), 1)
              failure_threshold     = coalesce(try(container.probes.liveness.failure_threshold, null), 3)
              success_threshold     = coalesce(try(container.probes.liveness.success_threshold, null), 1)
            }
            startup = {
              enabled               = coalesce(try(container.probes.startup.enabled, null), false)
              path                  = coalesce(try(container.probes.startup.path, null), "/")
              port                  = coalesce(try(container.probes.startup.port, null), coalesce(try(container.port, null), 8080))
              initial_delay_seconds = coalesce(try(container.probes.startup.initial_delay_seconds, null), 5)
              period_seconds        = coalesce(try(container.probes.startup.period_seconds, null), 10)
              timeout_seconds       = coalesce(try(container.probes.startup.timeout_seconds, null), 1)
              failure_threshold     = coalesce(try(container.probes.startup.failure_threshold, null), 30)
              success_threshold     = coalesce(try(container.probes.startup.success_threshold, null), 1)
            }
          }
        }
      ]
      volumes = concat([
        for volume in coalesce(try(app.volumes, null), []) : {
          name            = volume.name
          config_map_name = try(volume.config_map_name, null)
          secret_name     = try(volume.secret_name, null)
          empty_dir       = coalesce(try(volume.empty_dir, null), false)
        }
        ], try(app.config_map.enabled, false) ? [{
          name            = "app-config"
          config_map_name = coalesce(try(app.config_map.name, null), "${app.name}-config")
          secret_name     = null
          empty_dir       = false
      }] : [])
      config_map = {
        enabled    = try(app.config_map.enabled, false)
        name       = coalesce(try(app.config_map.name, null), "${app.name}-config")
        mount_path = coalesce(try(app.config_map.mount_path, null), "/usr/share/app/config")
        data       = coalesce(try(app.config_map.data, null), {})
      }
      ingress = {
        enabled         = try(app.ingress.enabled, false)
        class_name      = try(app.ingress.class_name, null)
        annotations     = coalesce(try(app.ingress.annotations, null), {})
        host            = try(app.ingress.host, null)
        path            = coalesce(try(app.ingress.path, null), "/")
        path_type       = coalesce(try(app.ingress.path_type, null), "Prefix")
        tls_secret_name = try(app.ingress.tls_secret_name, null)
      }
      network_policy = {
        ingress = [
          for rule in coalesce(try(app.network_policy.ingress, null), []) : {
            ports = [
              for port in coalesce(try(rule.ports, null), []) : {
                port     = port.port
                protocol = coalesce(try(port.protocol, null), "TCP")
              }
            ]
            from = [
              for peer in coalesce(try(rule.from, null), []) : {
                pod_selector       = coalesce(try(peer.pod_selector, null), {})
                namespace_selector = coalesce(try(peer.namespace_selector, null), {})
                ip_block = try(peer.ip_block.cidr, null) != null ? {
                  cidr   = peer.ip_block.cidr
                  except = coalesce(try(peer.ip_block.except, null), [])
                } : null
              }
            ]
          }
        ]
        egress = [
          for rule in coalesce(try(app.network_policy.egress, null), []) : {
            ports = [
              for port in coalesce(try(rule.ports, null), []) : {
                port     = port.port
                protocol = coalesce(try(port.protocol, null), "TCP")
              }
            ]
            to = [
              for peer in coalesce(try(rule.to, null), []) : {
                pod_selector       = coalesce(try(peer.pod_selector, null), {})
                namespace_selector = coalesce(try(peer.namespace_selector, null), {})
                ip_block = try(peer.ip_block.cidr, null) != null ? {
                  cidr   = peer.ip_block.cidr
                  except = coalesce(try(peer.ip_block.except, null), [])
                } : null
              }
            ]
          }
        ]
      }
    }
  }

  applications_with_config_map = {
    for name, app in local.ward_applications : name => app
    if app.config_map.enabled
  }

  applications_with_service = {
    for name, app in local.ward_applications : name => app
    if app.service.enabled
  }

  applications_with_same_namespace_ingress = {
    for name, app in local.ward_applications : name => app
    if app.allow_same_namespace_ingress
  }

  applications_with_ingress = {
    for name, app in local.ward_applications : name => app
    if app.ingress.enabled && app.service.enabled
  }

  applications_with_ingress_allowlists = {
    for name, app in local.ward_applications : name => app
    if length(app.network_policy.ingress) > 0
  }

  applications_with_egress_allowlists = {
    for name, app in local.ward_applications : name => app
    if length(app.network_policy.egress) > 0
  }
}
