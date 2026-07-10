variable "project_name" {
  description = "Project name used for bucket naming and tags."
  type        = string
  default     = "isolens"
}

variable "environment" {
  description = "Environment identifier used for naming."
  type        = string
  default     = "dev"
}

variable "region" {
  description = "AWS region where state storage resources will be created."
  type        = string
  default     = "eu-north-1"
}

variable "state_bucket_name" {
  description = "Globally unique S3 bucket name for Terraform state."
  type        = string
  default     = "isolens-lab"
}

variable "force_destroy" {
  description = "Whether the state bucket can be destroyed even when non-empty."
  type        = bool
  default     = false
}

variable "backend_ecr_repository_name" {
  description = "Name of the ECR repository that stores backend container images."
  type        = string
  default     = "isolens-backend"

  validation {
    condition     = can(regex("^[a-z0-9]+(?:[._/-][a-z0-9]+)*$", var.backend_ecr_repository_name))
    error_message = "backend_ecr_repository_name must be a valid ECR repository name."
  }
}

variable "frontend_ecr_repository_name" {
  description = "Name of the ECR repository that stores frontend container images."
  type        = string
  default     = "isolens-frontend"

  validation {
    condition     = can(regex("^[a-z0-9]+(?:[._/-][a-z0-9]+)*$", var.frontend_ecr_repository_name))
    error_message = "frontend_ecr_repository_name must be a valid ECR repository name."
  }
}

variable "ecr_image_tag_mutability" {
  description = "Tag mutability policy for the ECR repositories. Keep MUTABLE while the CI flow publishes the latest tag."
  type        = string
  default     = "MUTABLE"

  validation {
    condition     = contains(["MUTABLE", "IMMUTABLE"], var.ecr_image_tag_mutability)
    error_message = "ecr_image_tag_mutability must be either MUTABLE or IMMUTABLE."
  }
}

variable "ecr_scan_on_push" {
  description = "Whether ECR basic image scanning runs automatically when images are pushed."
  type        = bool
  default     = true
}

variable "ecr_untagged_image_retention_days" {
  description = "Number of days to retain untagged images in the backend and frontend ECR repositories."
  type        = number
  default     = 7

  validation {
    condition     = var.ecr_untagged_image_retention_days >= 1 && var.ecr_untagged_image_retention_days <= 3650
    error_message = "ecr_untagged_image_retention_days must be between 1 and 3650."
  }
}
