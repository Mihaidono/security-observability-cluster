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
  description = "AWS region of the existing EKS cluster targeted by the applications stage."
  type        = string
  default     = "eu-north-1"
}

variable "cluster_name" {
  description = "Name of the existing EKS cluster targeted by the applications stage."
  type        = string
  default     = "forensic-lab"
}

variable "kubernetes_version" {
  description = "Cluster Kubernetes version used to label ward namespaces with the matching PSA version."
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

variable "analysis_subjects" {
  description = "Ward namespace definitions used to validate application placement."
  type        = map(any)
  default     = {}

  validation {
    condition = alltrue([
      for name in keys(var.analysis_subjects) :
      can(regex("^[a-z0-9]([-a-z0-9]*[a-z0-9])?$", name)) && length(name) <= 63
    ])
    error_message = "Each analysis_subjects key must be a valid Kubernetes namespace name."
  }
}

variable "ward_applications" {
  description = "Application definitions rendered into Deployments plus optional Services, Ingresses, generated ConfigMaps, volumes, and app-specific NetworkPolicies."
  type        = any
  default     = []

  validation {
    condition = can([
      for app in var.ward_applications : {
        name      = app.name
        namespace = app.namespace
      }
    ])
    error_message = "ward_applications must be a list of objects that at least define name and namespace."
  }
}
