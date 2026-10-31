variable "region" {
  description = "AWS region containing the EKS cluster."
  type        = string
}

variable "cluster_name" {
  description = "Existing EKS cluster where prerequisite CRDs are installed."
  type        = string
}

variable "gateway_api_crds_version" {
  description = "Pinned upstream Gateway API standard channel version."
  type        = string
}

variable "enable_cert_manager" {
  description = "Whether to install cert-manager CRDs before the platform stage is planned. Keep enabled while any certificates depend on these CRDs."
  type        = bool
  default     = false
}

variable "cert_manager_version" {
  description = "Pinned cert-manager release including the v prefix; must match the platform Helm chart version."
  type        = string
}
