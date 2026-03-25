project_name                   = "kubeguardian"
environment                    = "lab"
cluster_name                   = "forensic-lab"
kubernetes_version             = "1.35"
cluster_admin_principal_arns   = []
enable_custom_runtime_policies = false

analysis_subjects = {
  "ward-banking-api" = {
    tier        = "production-mirror"
    description = "Analyzing behavioral baseline of the core banking engine."
    labels = {
      owner = "payments"
    }
  },
  "ward-external-proxy" = {
    tier        = "high-risk"
    description = "Watching for data exfiltration patterns on public-facing ingress."
    labels = {
      owner = "edge"
    }
  },
  "ward-legacy-service" = {
    tier        = "isolated"
    description = "Monitoring a legacy Java app for unexpected process spawning."
    labels = {
      owner = "core-platform"
    }
    resource_quota = {
      pods            = "5"
      requests_cpu    = "1"
      requests_memory = "2Gi"
      limits_cpu      = "2"
      limits_memory   = "4Gi"
    }
  }
}

ward_applications = [
  {
    name      = "banking-api"
    namespace = "ward-banking-api"
    replicas  = 2
    pod_labels = {
      app_role = "api"
    }
    service = {
      port = 8080
    }
    network_policy = {
      ingress = [
        {
          ports = [
            {
              port = 8080
            }
          ]
          from = [
            {
              pod_selector = {
                app_role = "frontend"
              }
            }
          ]
        }
      ]
      egress = [
        {
          ports = [
            {
              port = 5432
            }
          ]
          to = [
            {
              namespace_selector = {
                "kubernetes.io/metadata.name" = "ward-banking-api"
              }
              pod_selector = {
                app_role = "db"
              }
            }
          ]
        }
      ]
    }
    ingress = {
      enabled    = true
      class_name = "nginx"
      host       = "banking-api.lab.internal"
      path       = "/"
      annotations = {
        "nginx.ingress.kubernetes.io/ssl-redirect" = "false"
      }
    }
    containers = [
      {
        name  = "banking-api"
        image = "nginxinc/nginx-unprivileged:1.27-alpine"
        env = {
          APP_PROFILE = "payments"
        }
        probes = {
          readiness = {
            enabled = true
          }
          liveness = {
            enabled = true
          }
        }
        resources = {
          requests_cpu    = "150m"
          requests_memory = "192Mi"
          limits_cpu      = "500m"
          limits_memory   = "256Mi"
        }
      },
      {
        name  = "metrics-sidecar"
        image = "nginxinc/nginx-unprivileged:1.27-alpine"
        port  = 9090
        args  = ["nginx", "-g", "daemon off;"]
        volume_mounts = [
          {
            name       = "shared-cache"
            mount_path = "/tmp"
          }
        ]
      }
    ]
    volumes = [
      {
        name      = "shared-cache"
        empty_dir = true
      }
    ]
    config_map = {
      enabled    = true
      mount_path = "/usr/share/nginx/html"
      data = {
        "index.html" = "<html><body><h1>banking-api</h1><p>payments ward</p></body></html>"
      }
    }
  },
  {
    name      = "external-proxy"
    namespace = "ward-external-proxy"
    service = {
      port = 8080
      annotations = {
        "service.beta.kubernetes.io/aws-load-balancer-scheme" = "internet-facing"
      }
    }
    container = {
      name  = "external-proxy"
      image = "nginxinc/nginx-unprivileged:1.27-alpine"
      env = {
        APP_PROFILE = "edge"
      }
      env_from_secret_names = ["external-proxy-env"]
      probes = {
        readiness = {
          enabled = true
        }
      }
      volume_mounts = [
        {
          name       = "tls-bundle"
          mount_path = "/etc/proxy/certs"
        }
      ]
    }
    volumes = [
      {
        name        = "tls-bundle"
        secret_name = "external-proxy-tls"
      }
    ]
    network_policy = {
      egress = [
        {
          ports = [
            {
              port = 443
            }
          ]
          to = [
            {
              ip_block = {
                cidr = "0.0.0.0/0"
              }
            }
          ]
        }
      ]
    }
  },
  {
    name      = "legacy-service"
    namespace = "ward-legacy-service"
    replicas  = 2
    service = {
      port = 8080
    }
    container = {
      name    = "legacy-service"
      image   = "nginxinc/nginx-unprivileged:1.27-alpine"
      command = ["nginx"]
      args    = ["-g", "daemon off;"]
      env = {
        APP_PROFILE = "legacy"
      }
      probes = {
        startup = {
          enabled               = true
          failure_threshold     = 40
          period_seconds        = 5
          initial_delay_seconds = 10
        }
        readiness = {
          enabled = true
        }
      }
      resources = {
        requests_cpu    = "200m"
        requests_memory = "256Mi"
        limits_cpu      = "750m"
        limits_memory   = "512Mi"
      }
    }
    network_policy = {
      ingress = []
      egress = [
        {
          ports = [
            {
              port     = 8080
              protocol = "TCP"
            }
          ]
          to = [
            {
              namespace_selector = {
                "kubernetes.io/metadata.name" = "monitoring-zone"
              }
            }
          ]
        }
      ]
    }
  }
]
