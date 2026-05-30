project_name                          = "isolens"
environment                           = "lab"
cluster_name                          = "forensic-lab"
kubernetes_version                    = "1.35"
cluster_log_retention_in_days         = 90
cluster_admin_principal_arns          = []
analysis_subjects = {
  "ward-public-api" = {
    tier        = "public-demo"
    description = "Ingress-exposed Python API meant for lab demonstrations around reachability, egress, and operator workflow."
    labels = {
      owner    = "demo"
      scenario = "public-api"
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
    name      = "public-python-api"
    namespace = "ward-public-api"
    replicas  = 2
    pod_labels = {
      app_role     = "api"
      scenario     = "public"
      expose_class = "web"
    }
    service = {
      enabled     = true
      type        = "ClusterIP"
      port        = 80
      target_port = 80
      annotations = {}
    }
    network_policy = {
      ingress = [
        {
          ports = [
            {
              port     = 80
              protocol = "TCP"
            }
          ]
          from = [
            {
              namespace_selector = {
                "kubernetes.io/metadata.name" = "ingress-nginx"
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
              port     = 443
              protocol = "TCP"
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
      host       = "public-python-api.lab.internal"
      path       = "/"
      path_type  = "Prefix"
      annotations = {
        "nginx.ingress.kubernetes.io/ssl-redirect" = "false"
      }
    }
    containers = [
      {
        name              = "api"
        image             = "tiangolo/uvicorn-gunicorn-fastapi:python3.11-slim"
        image_pull_policy = "IfNotPresent"
        port              = 80
        env = {
          APP_DISPLAY_NAME = "Public Python API"
          SCENARIO_NAME    = "public-python-api"
          SCENARIO_PROFILE = "internet-egress"
          DEMO_EGRESS_URL  = "https://example.com"
        }
        env_from_secret_names = []
        probes = {
          readiness = {
            enabled = true
            path    = "/health"
            port    = 80
          }
          liveness = {
            enabled = true
            path    = "/health"
            port    = 80
          }
        }
        resources = {
          requests_cpu    = "150m"
          requests_memory = "192Mi"
          limits_cpu      = "500m"
          limits_memory   = "256Mi"
        }
        volume_mounts = []
      }
    ]
    volumes = []
    config_map = {
      enabled    = true
      mount_path = "/app"
      data = {
        "main.py" = <<-EOT
          from fastapi import FastAPI, Request
          from fastapi.responses import JSONResponse

          import os
          import socket
          import urllib.error
          import urllib.request

          app = FastAPI(title=os.getenv("APP_DISPLAY_NAME", "Isolens Demo API"))

          @app.get("/health")
          def health():
              return {
                  "status": "ok",
                  "scenario": os.getenv("SCENARIO_NAME", "demo"),
                  "hostname": socket.gethostname(),
              }

          @app.get("/")
          def root():
              return {
                  "message": "Isolens demo workload is live",
                  "scenario": os.getenv("SCENARIO_NAME", "demo"),
                  "profile": os.getenv("SCENARIO_PROFILE", "baseline"),
              }

          @app.get("/headers")
          def headers(request: Request):
              selected_headers = {}
              for key, value in request.headers.items():
                  if key.lower() in {"host", "user-agent", "x-forwarded-for", "x-forwarded-proto"}:
                      selected_headers[key] = value
              return {
                  "scenario": os.getenv("SCENARIO_NAME", "demo"),
                  "headers": selected_headers,
              }

          @app.get("/egress-check")
          def egress_check(url: str = os.getenv("DEMO_EGRESS_URL", "https://example.com")):
              try:
                  with urllib.request.urlopen(url, timeout=5) as response:
                      return {
                          "ok": True,
                          "target": url,
                          "status": response.status,
                          "scenario": os.getenv("SCENARIO_NAME", "demo"),
                      }
              except (urllib.error.URLError, TimeoutError, ValueError) as exc:
                  return JSONResponse(
                      status_code=502,
                      content={
                          "ok": False,
                          "target": url,
                          "scenario": os.getenv("SCENARIO_NAME", "demo"),
                          "error": str(exc),
                      },
                  )
        EOT
      }
    }
  }
]
