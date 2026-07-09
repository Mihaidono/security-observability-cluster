# tflint-ignore-file: terraform_unused_declarations

variable "analysis_subjects" {
  description = "Accepted for compatibility with the shared tfvars payload. The core stage no longer manages ward namespaces directly."
  type        = map(any)
  default     = {}
}

variable "ward_applications" {
  description = "Accepted for compatibility with the shared tfvars payload. The core stage no longer manages in-cluster workloads directly."
  type        = any
  default     = []
}
