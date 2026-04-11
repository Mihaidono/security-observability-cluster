project_name                   = "kubeguardian"
environment                    = "lab"
cluster_name                   = "forensic-lab"
kubernetes_version             = "1.35"
cluster_admin_principal_arns   = []
enable_custom_runtime_policies = false

analysis_subjects = {
  "ward-template-app" = {
    tier        = "template"
    description = "Reference ward used as a full-feature application template for platform-driven deployments."
    labels = {
      owner        = "platform"
      template_for = "frontend-driven-apps"
    }
    resource_quota = {
      pods            = "10"
      requests_cpu    = "2"
      requests_memory = "4Gi"
      limits_cpu      = "4"
      limits_memory   = "8Gi"
    }
  }
}

ward_applications = [
  {
    name      = "template-app"
    namespace = "ward-template-app"
    replicas  = 2
    pod_labels = {
      app_role     = "api"
      expose_class = "web"
    }
    service = {
      port = 8080
      annotations = {
        "service.beta.kubernetes.io/aws-load-balancer-scheme" = "internet-facing"
      }
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
                app_role = "ingress"
              }
            },
            {
              namespace_selector = {
                "kubernetes.io/metadata.name" = "monitoring-zone"
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
                "kubernetes.io/metadata.name" = "ward-template-app"
              }
              pod_selector = {
                app_role = "db"
              }
            }
          ]
        },
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
    ingress = {
      enabled    = true
      class_name = "nginx"
      host       = "template-app.lab.internal"
      path       = "/"
      annotations = {
        "nginx.ingress.kubernetes.io/ssl-redirect" = "false"
      }
    }
    containers = [
      {
        name  = "template-app"
        image = "nginxinc/nginx-unprivileged:1.27-alpine"
        env = {
          APP_PROFILE = "template"
          APP_MODE    = "frontend-managed"
        }
        env_from_secret_names = ["template-app-env"]
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
        volume_mounts = [
          {
            name       = "tls-bundle"
            mount_path = "/etc/template/certs"
          }
        ]
      },
      {
        name  = "log-sidecar"
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
      },
      {
        name        = "tls-bundle"
        secret_name = "template-app-tls"
      }
    ]
    config_map = {
      enabled    = true
      mount_path = "/usr/share/nginx/html"
      data = {
        "index.html" = "<html><body><h1>template-app</h1><p>Single reference app for frontend-driven cluster changes.</p></body></html>"
      }
    }
  }
]
