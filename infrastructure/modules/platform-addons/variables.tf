variable "kubernetes_version" {
  description = "Cluster Kubernetes version used to label namespaces with the matching PSA version."
  type        = string
}

variable "enable_ingress_nginx" {
  description = "Whether the shared nginx ingress controller should be installed by the platform layer."
  type        = bool
  default     = false
}
