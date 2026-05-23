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
  description = "AWS region of the existing EKS cluster and AWS lookups used by the policies stage."
  type        = string
  default     = "eu-north-1"
}

variable "cluster_name" {
  description = "Name of the existing EKS cluster targeted by the policies stage."
  type        = string
  default     = "forensic-lab"
}

variable "kubernetes_version" {
  description = "Accepted for compatibility with the shared tfvars payload; the policies stage does not set cluster version directly."
  type        = string
  default     = "1.35"
}

variable "analysis_subjects" {
  description = "Ward namespace definitions consumed by namespaced Tetragon tracing policies and policy-stage outputs. The namespaces themselves must already exist from the core stage."
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
