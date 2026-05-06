variable "project_name" {
  description = "Logical project name used for tagging and cluster naming."
  type        = string
  default     = "isolens"
}

variable "environment" {
  description = "Environment name used for tags and naming."
  type        = string
  default     = "lab"
}

variable "region" {
  description = "AWS region where the lab will be deployed."
  type        = string
  default     = "eu-north-1"
}

variable "cluster_name" {
  description = "Name of the EKS cluster."
  type        = string
  default     = "forensic-lab"
}

variable "kubernetes_version" {
  description = "EKS control plane version."
  type        = string
  default     = "1.35"
}

variable "vpc_cidr" {
  description = "CIDR block for the lab VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnets" {
  description = "Private subnet CIDRs for worker nodes."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "public_subnets" {
  description = "Public subnet CIDRs for load balancers and NAT."
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24"]
}

variable "node_instance_types" {
  description = "Worker node instance types."
  type        = list(string)
  default     = ["t3.xlarge"]
}

variable "node_group_scaling" {
  description = "Managed node group scaling configuration."
  type = object({
    min_size     = number
    max_size     = number
    desired_size = number
  })
  default = {
    min_size     = 2
    max_size     = 5
    desired_size = 2
  }
}

variable "cluster_admin_principal_arns" {
  description = "IAM principal ARNs that should receive EKS cluster admin access."
  type        = list(string)
  default     = []
}

variable "analysis_subjects" {
  description = "Namespaces to create as isolated wards for runtime analysis."
  type = map(object({
    tier        = string
    description = string
    labels      = optional(map(string), {})
    annotations = optional(map(string), {})
    resource_quota = optional(object({
      pods            = optional(string, "10")
      requests_cpu    = optional(string, "2")
      requests_memory = optional(string, "4Gi")
      limits_cpu      = optional(string, "4")
      limits_memory   = optional(string, "8Gi")
    }), {})
  }))
}

variable "ward_applications" {
  description = "Application deployments to run inside ward namespaces."
  type = list(object({
    name                            = string
    namespace                       = string
    replicas                        = optional(number, 1)
    pod_labels                      = optional(map(string), {})
    pod_annotations                 = optional(map(string), {})
    automount_service_account_token = optional(bool, false)
    allow_same_namespace_ingress    = optional(bool, true)
    service = optional(object({
      enabled     = optional(bool, true)
      name        = optional(string)
      type        = optional(string, "ClusterIP")
      port        = optional(number, 8080)
      target_port = optional(number)
      annotations = optional(map(string), {})
    }), {})
    container = optional(object({
      name                  = optional(string, "app")
      image                 = string
      image_pull_policy     = optional(string, "IfNotPresent")
      command               = optional(list(string), [])
      args                  = optional(list(string), [])
      port                  = optional(number, 8080)
      env                   = optional(map(string), {})
      env_from_secret_names = optional(list(string), [])
      volume_mounts = optional(list(object({
        name       = string
        mount_path = string
        sub_path   = optional(string)
        read_only  = optional(bool, true)
      })), [])
      resources = optional(object({
        requests_cpu    = optional(string, "100m")
        requests_memory = optional(string, "128Mi")
        limits_cpu      = optional(string, "500m")
        limits_memory   = optional(string, "256Mi")
      }), {})
      security_context = optional(object({
        run_as_user               = optional(number, 101)
        run_as_group              = optional(number, 101)
        read_only_root_filesystem = optional(bool, false)
      }), {})
      probes = optional(object({
        readiness = optional(object({
          enabled               = optional(bool, false)
          path                  = optional(string, "/")
          port                  = optional(number)
          initial_delay_seconds = optional(number, 5)
          period_seconds        = optional(number, 10)
          timeout_seconds       = optional(number, 1)
          failure_threshold     = optional(number, 3)
          success_threshold     = optional(number, 1)
        }), {})
        liveness = optional(object({
          enabled               = optional(bool, false)
          path                  = optional(string, "/")
          port                  = optional(number)
          initial_delay_seconds = optional(number, 15)
          period_seconds        = optional(number, 20)
          timeout_seconds       = optional(number, 1)
          failure_threshold     = optional(number, 3)
          success_threshold     = optional(number, 1)
        }), {})
        startup = optional(object({
          enabled               = optional(bool, false)
          path                  = optional(string, "/")
          port                  = optional(number)
          initial_delay_seconds = optional(number, 5)
          period_seconds        = optional(number, 10)
          timeout_seconds       = optional(number, 1)
          failure_threshold     = optional(number, 30)
          success_threshold     = optional(number, 1)
        }), {})
      }), {})
    }))
    containers = optional(list(object({
      name                  = optional(string, "app")
      image                 = string
      image_pull_policy     = optional(string, "IfNotPresent")
      command               = optional(list(string), [])
      args                  = optional(list(string), [])
      port                  = optional(number, 8080)
      env                   = optional(map(string), {})
      env_from_secret_names = optional(list(string), [])
      volume_mounts = optional(list(object({
        name       = string
        mount_path = string
        sub_path   = optional(string)
        read_only  = optional(bool, true)
      })), [])
      resources = optional(object({
        requests_cpu    = optional(string, "100m")
        requests_memory = optional(string, "128Mi")
        limits_cpu      = optional(string, "500m")
        limits_memory   = optional(string, "256Mi")
      }), {})
      security_context = optional(object({
        run_as_user               = optional(number, 101)
        run_as_group              = optional(number, 101)
        read_only_root_filesystem = optional(bool, false)
      }), {})
      probes = optional(object({
        readiness = optional(object({
          enabled               = optional(bool, false)
          path                  = optional(string, "/")
          port                  = optional(number)
          initial_delay_seconds = optional(number, 5)
          period_seconds        = optional(number, 10)
          timeout_seconds       = optional(number, 1)
          failure_threshold     = optional(number, 3)
          success_threshold     = optional(number, 1)
        }), {})
        liveness = optional(object({
          enabled               = optional(bool, false)
          path                  = optional(string, "/")
          port                  = optional(number)
          initial_delay_seconds = optional(number, 15)
          period_seconds        = optional(number, 20)
          timeout_seconds       = optional(number, 1)
          failure_threshold     = optional(number, 3)
          success_threshold     = optional(number, 1)
        }), {})
        startup = optional(object({
          enabled               = optional(bool, false)
          path                  = optional(string, "/")
          port                  = optional(number)
          initial_delay_seconds = optional(number, 5)
          period_seconds        = optional(number, 10)
          timeout_seconds       = optional(number, 1)
          failure_threshold     = optional(number, 30)
          success_threshold     = optional(number, 1)
        }), {})
      }), {})
    })), [])
    volumes = optional(list(object({
      name            = string
      config_map_name = optional(string)
      secret_name     = optional(string)
      empty_dir       = optional(bool, false)
    })), [])
    config_map = optional(object({
      enabled    = optional(bool, false)
      name       = optional(string)
      mount_path = optional(string, "/usr/share/app/config")
      data       = optional(map(string), {})
    }), {})
    ingress = optional(object({
      enabled         = optional(bool, false)
      class_name      = optional(string)
      annotations     = optional(map(string), {})
      host            = optional(string)
      path            = optional(string, "/")
      path_type       = optional(string, "Prefix")
      tls_secret_name = optional(string)
    }), {})
    network_policy = optional(object({
      ingress = optional(list(object({
        ports = optional(list(object({
          port     = number
          protocol = optional(string, "TCP")
        })), [])
        from = optional(list(object({
          pod_selector       = optional(map(string), {})
          namespace_selector = optional(map(string), {})
          ip_block = optional(object({
            cidr   = string
            except = optional(list(string), [])
          }))
        })), [])
      })), [])
      egress = optional(list(object({
        ports = optional(list(object({
          port     = number
          protocol = optional(string, "TCP")
        })), [])
        to = optional(list(object({
          pod_selector       = optional(map(string), {})
          namespace_selector = optional(map(string), {})
          ip_block = optional(object({
            cidr   = string
            except = optional(list(string), [])
          }))
        })), [])
      })), [])
    }), {})
  }))
  default = []
}
