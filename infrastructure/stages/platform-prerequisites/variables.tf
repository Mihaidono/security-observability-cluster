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
