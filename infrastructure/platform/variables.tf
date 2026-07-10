variable "project_name" {
  description = "Logical project name used for tagging and naming."
  type        = string
  default     = "isolens"
}

variable "environment" {
  description = "Environment name used for tags and naming."
  type        = string
  default     = "lab"
}

variable "region" {
  description = "AWS region of the existing EKS cluster targeted by the platform stage."
  type        = string
  default     = "eu-north-1"
}

variable "cluster_name" {
  description = "Name of the existing EKS cluster targeted by the platform stage."
  type        = string
  default     = "forensic-lab"
}

variable "kubernetes_version" {
  description = "Cluster Kubernetes version used to label namespaces with the matching PSA version."
  type        = string
  default     = "1.35"
}

variable "cluster_admin_principal_arns" {
  description = "IAM principal ARNs granted cluster-admin access in the core stage. Used here to keep the post-core readiness wait tied to access configuration changes."
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

variable "enable_ingress_nginx" {
  description = "Whether the shared nginx ingress controller should be installed by the platform layer."
  type        = bool
  default     = false
}

variable "control_plane_namespace" {
  description = "Namespace reserved for the Isolens backend and frontend workloads."
  type        = string
  default     = "isolens-system"
}

variable "control_plane_namespace_labels" {
  description = "Additional labels applied to the control-plane namespace."
  type        = map(string)
  default     = {}
}

variable "control_plane_namespace_annotations" {
  description = "Additional annotations applied to the control-plane namespace."
  type        = map(string)
  default     = {}
}

variable "control_plane_backend_image" {
  description = "Container image for the control-plane backend workload."
  type        = string
  default     = "401262697743.dkr.ecr.eu-north-1.amazonaws.com/isolens-backend:latest"
}

variable "control_plane_backend_image_pull_policy" {
  description = "Image pull policy for the control-plane backend workload."
  type        = string
  default     = "IfNotPresent"
}

variable "control_plane_backend_replicas" {
  description = "Replica count for the control-plane backend workload."
  type        = number
  default     = 1
}

variable "control_plane_backend_service_name" {
  description = "Service name for the control-plane backend workload."
  type        = string
  default     = "isolens-backend"
}

variable "control_plane_backend_service_port" {
  description = "Service port for the control-plane backend workload."
  type        = number
  default     = 8000
}

variable "control_plane_backend_container_port" {
  description = "Container port for the control-plane backend workload."
  type        = number
  default     = 8000
}

variable "control_plane_backend_api_token" {
  description = "Bearer token required by the control-plane backend API."
  type        = string
  sensitive   = true
  default     = "dev-token"
}

variable "control_plane_backend_resources" {
  description = "Resource requests and limits for the control-plane backend container."
  type = object({
    requests_cpu    = string
    requests_memory = string
    limits_cpu      = string
    limits_memory   = string
  })
  default = {
    requests_cpu    = "250m"
    requests_memory = "512Mi"
    limits_cpu      = "1000m"
    limits_memory   = "1Gi"
  }
}

variable "control_plane_frontend_image" {
  description = "Container image for the control-plane frontend workload."
  type        = string
  default     = "401262697743.dkr.ecr.eu-north-1.amazonaws.com/isolens-frontend:latest"
}

variable "control_plane_frontend_image_pull_policy" {
  description = "Image pull policy for the control-plane frontend workload."
  type        = string
  default     = "IfNotPresent"
}

variable "control_plane_frontend_replicas" {
  description = "Replica count for the control-plane frontend workload."
  type        = number
  default     = 1
}

variable "control_plane_frontend_service_name" {
  description = "Service name for the control-plane frontend workload."
  type        = string
  default     = "isolens-frontend"
}

variable "control_plane_frontend_service_port" {
  description = "Service port for the control-plane frontend workload."
  type        = number
  default     = 80
}

variable "control_plane_frontend_container_port" {
  description = "Container port for the control-plane frontend workload."
  type        = number
  default     = 8080
}

variable "control_plane_frontend_resources" {
  description = "Resource requests and limits for the control-plane frontend container."
  type = object({
    requests_cpu    = string
    requests_memory = string
    limits_cpu      = string
    limits_memory   = string
  })
  default = {
    requests_cpu    = "100m"
    requests_memory = "128Mi"
    limits_cpu      = "500m"
    limits_memory   = "256Mi"
  }
}

variable "control_plane_runner_name" {
  description = "Deployment name for the control-plane Terraform runner."
  type        = string
  default     = "isolens-runner"
}

variable "control_plane_runner_replicas" {
  description = "Replica count for the control-plane Terraform runner."
  type        = number
  default     = 1
}

variable "control_plane_runner_resources" {
  description = "Resource requests and limits for the control-plane Terraform runner container."
  type = object({
    requests_cpu    = string
    requests_memory = string
    limits_cpu      = string
    limits_memory   = string
  })
  default = {
    requests_cpu    = "250m"
    requests_memory = "512Mi"
    limits_cpu      = "1000m"
    limits_memory   = "1Gi"
  }
}

variable "postgresql_name" {
  description = "Base name used for PostgreSQL resources in the control-plane namespace."
  type        = string
  default     = "isolens-postgresql"
}

variable "postgresql_database_name" {
  description = "Database name created for the control plane."
  type        = string
  default     = "isolens"
}

variable "postgresql_username" {
  description = "Application username created for the control plane database."
  type        = string
  default     = "isolens"
}

variable "postgresql_password" {
  description = "Application password stored in the PostgreSQL Secret."
  type        = string
  sensitive   = true
  default     = "isolens-dev-password-change-me"
}

variable "postgresql_image" {
  description = "Container image used for the control-plane PostgreSQL workload."
  type        = string
  default     = "postgres:16.9-alpine"
}

variable "postgresql_storage_size" {
  description = "Persistent volume size for the control-plane PostgreSQL data."
  type        = string
  default     = "20Gi"
}

variable "postgresql_storage_class_name" {
  description = "Optional storage class name for the PostgreSQL persistent volume claim."
  type        = string
  default     = null
}

variable "postgresql_service_port" {
  description = "Service port exposed by PostgreSQL."
  type        = number
  default     = 5432
}

variable "postgresql_resources" {
  description = "Resource requests and limits for the PostgreSQL container."
  type = object({
    requests_cpu    = string
    requests_memory = string
    limits_cpu      = string
    limits_memory   = string
  })
  default = {
    requests_cpu    = "250m"
    requests_memory = "512Mi"
    limits_cpu      = "1000m"
    limits_memory   = "1Gi"
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
