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
