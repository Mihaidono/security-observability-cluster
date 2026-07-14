variable "kubernetes_version" {
  description = "Cluster Kubernetes version used to label namespaces with the matching PSA version."
  type        = string
}

variable "cluster_name" {
  description = "Name of the EKS cluster where Cilium is installed."
  type        = string
}

variable "cluster_vpc_cidr" {
  description = "IPv4 CIDR block of the cluster VPC used for Cilium native routing."
  type        = string
}

variable "cilium_operator_iam_role_arn" {
  description = "IAM role ARN assumed by the Cilium operator for ENI management."
  type        = string
}

variable "enable_ingress_nginx" {
  description = "Whether the shared nginx ingress controller should be installed by the platform layer."
  type        = bool
  default     = false
}
