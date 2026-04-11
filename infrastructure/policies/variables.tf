variable "project_name" {
  description = "Logical project name used for tagging and cluster naming."
  type        = string
  default     = "kubeguardian"
}

variable "environment" {
  description = "Environment name used for tags and naming."
  type        = string
  default     = "lab"
}

variable "region" {
  description = "AWS region where the lab will be deployed."
  type        = string
  default     = "us-east-1"
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
  description = "Accepted for compatibility with the shared tfvars payload."
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnets" {
  description = "Accepted for compatibility with the shared tfvars payload."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "public_subnets" {
  description = "Accepted for compatibility with the shared tfvars payload."
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24"]
}

variable "node_instance_types" {
  description = "Accepted for compatibility with the shared tfvars payload."
  type        = list(string)
  default     = ["t3.xlarge"]
}

variable "node_group_scaling" {
  description = "Accepted for compatibility with the shared tfvars payload."
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
  description = "Accepted for compatibility with the shared tfvars payload."
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
  description = "Accepted for compatibility with the shared tfvars payload."
  type        = list(any)
  default     = []
}
