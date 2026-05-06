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
  description = "AWS region where the core stage creates the VPC, EKS cluster, and stage-owned AWS resources."
  type        = string
  default     = "eu-north-1"
}

variable "cluster_name" {
  description = "Name of the EKS cluster created by the core stage."
  type        = string
  default     = "forensic-lab"
}

variable "kubernetes_version" {
  description = "Kubernetes minor version requested for the EKS control plane."
  type        = string
  default     = "1.35"
}

variable "cluster_log_retention_in_days" {
  description = "Retention period, in days, for the EKS control-plane CloudWatch log group."
  type        = number
  default     = 90

  validation {
    condition = contains([
      1,
      3,
      5,
      7,
      14,
      30,
      60,
      90,
      120,
      150,
      180,
      365,
      400,
      545,
      731,
      1096,
      1827,
      2192,
      2557,
      2922,
      3288,
      3653,
    ], var.cluster_log_retention_in_days)
    error_message = "cluster_log_retention_in_days must be a supported CloudWatch Logs retention value."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the lab VPC."
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr must be a valid IPv4 CIDR block."
  }
}

variable "private_subnets" {
  description = "Private subnet CIDRs for worker nodes."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]

  validation {
    condition     = length(var.private_subnets) == 2 && length(toset(var.private_subnets)) == 2 && alltrue([for cidr in var.private_subnets : can(cidrhost(cidr, 0))])
    error_message = "private_subnets must contain exactly two unique valid CIDR blocks to match the two configured availability zones."
  }
}

variable "public_subnets" {
  description = "Public subnet CIDRs for load balancers and NAT."
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24"]

  validation {
    condition     = length(var.public_subnets) == 2 && length(toset(var.public_subnets)) == 2 && alltrue([for cidr in var.public_subnets : can(cidrhost(cidr, 0))])
    error_message = "public_subnets must contain exactly two unique valid CIDR blocks to match the two configured availability zones."
  }
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

  validation {
    condition     = var.node_group_scaling.min_size <= var.node_group_scaling.desired_size && var.node_group_scaling.desired_size <= var.node_group_scaling.max_size
    error_message = "node_group_scaling must satisfy min_size <= desired_size <= max_size."
  }
}

variable "cluster_admin_principal_arns" {
  description = "IAM principal ARNs granted EKS cluster-admin access through access entries so Terraform can safely manage in-cluster Kubernetes and Helm resources."
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.cluster_admin_principal_arns) == length(toset(var.cluster_admin_principal_arns))
    error_message = "cluster_admin_principal_arns must not contain duplicate entries."
  }

  validation {
    condition     = alltrue([for arn in var.cluster_admin_principal_arns : can(regex("^arn:aws[a-z-]*:iam::[0-9]{12}:(role|user)/.+$", arn))])
    error_message = "cluster_admin_principal_arns must contain IAM role or user ARNs."
  }
}

variable "analysis_subjects" {
  description = "Ward namespace definitions. Each entry creates a namespace, ward metadata ConfigMap, ResourceQuota, LimitRange, and baseline NetworkPolicies."
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

  validation {
    condition = alltrue([
      for name in keys(var.analysis_subjects) :
      can(regex("^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", name)) && length(name) <= 63
    ])
    error_message = "Each analysis_subjects key must be a valid Kubernetes namespace name."
  }
}

variable "ward_applications" {
  description = "Application definitions rendered into Deployments plus optional Services, Ingresses, generated ConfigMaps, volumes, and app-specific NetworkPolicies inside ward namespaces."
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

  validation {
    condition     = length(var.ward_applications) == length(toset([for app in var.ward_applications : app.name]))
    error_message = "Each ward application name must be globally unique because Terraform keys application resources by app.name."
  }

  validation {
    condition = alltrue([
      for app in var.ward_applications :
      can(regex("^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", app.name)) &&
      length(app.name) <= 63 &&
      can(regex("^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", app.namespace)) &&
      length(app.namespace) <= 63
    ])
    error_message = "Each ward application name and namespace must be valid Kubernetes DNS label names."
  }

  validation {
    condition = alltrue([
      for app in var.ward_applications :
      (try(app.container, null) != null) != (length(try(app.containers, [])) > 0)
    ])
    error_message = "Each ward application must define exactly one of container or containers."
  }

  validation {
    condition = alltrue([
      for app in var.ward_applications :
      !try(app.ingress.enabled, false) || try(app.service.enabled, true)
    ])
    error_message = "Ward applications with ingress enabled must also have service.enabled set to true."
  }

  validation {
    condition = alltrue([
      for app in var.ward_applications :
      !try(app.ingress.enabled, false) || try(app.ingress.class_name, null) != null
    ])
    error_message = "Ward applications with ingress enabled must set ingress.class_name explicitly."
  }

  validation {
    condition = alltrue([
      for app in var.ward_applications :
      contains(["ClusterIP", "NodePort", "LoadBalancer", "ExternalName"], try(app.service.type, "ClusterIP"))
    ])
    error_message = "Ward application services must use one of ClusterIP, NodePort, LoadBalancer, or ExternalName."
  }

  validation {
    condition = alltrue(flatten([
      for app in var.ward_applications : [
        for volume in try(app.volumes, []) :
        length(compact([
          try(volume.config_map_name, null),
          try(volume.secret_name, null),
          try(volume.empty_dir, false) ? "emptyDir" : null,
        ])) == 1
      ]
    ]))
    error_message = "Each ward application volume must declare exactly one source: config_map_name, secret_name, or empty_dir."
  }

  validation {
    condition = alltrue([
      for app in var.ward_applications :
      !try(app.config_map.enabled, false) || length(try(app.config_map.data, {})) > 0
    ])
    error_message = "Ward applications with config_map.enabled set to true must supply at least one config_map.data entry."
  }
}
