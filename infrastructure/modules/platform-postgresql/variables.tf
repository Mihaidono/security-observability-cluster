variable "namespace" {
  description = "Namespace where PostgreSQL will run."
  type        = string
}

variable "name" {
  description = "Base name used for PostgreSQL resources."
  type        = string
  default     = "isolens-postgresql"
}

variable "database_name" {
  description = "Database name created by the PostgreSQL container."
  type        = string
  default     = "isolens"
}

variable "username" {
  description = "Application username created by the PostgreSQL container."
  type        = string
  default     = "isolens"
}

variable "password" {
  description = "Application password stored in the PostgreSQL Secret."
  type        = string
  sensitive   = true
  default     = "isolens-dev-password-change-me"
}

variable "image" {
  description = "Container image for PostgreSQL."
  type        = string
  default     = "postgres:16.9-alpine"
}

variable "storage_size" {
  description = "Persistent volume size for PostgreSQL data."
  type        = string
  default     = "20Gi"
}

variable "storage_class_name" {
  description = "Optional storage class name for the PostgreSQL volume claim."
  type        = string
  default     = null
}

variable "service_port" {
  description = "Service port exposed by PostgreSQL."
  type        = number
  default     = 5432
}

variable "resources" {
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
