variable "namespace" {
  description = "Namespace used for the Isolens control-plane workloads."
  type        = string
}

variable "kubernetes_version" {
  description = "Cluster Kubernetes version used to label the namespace with the matching PSA version."
  type        = string
}

variable "labels" {
  description = "Additional labels applied to the control-plane namespace."
  type        = map(string)
  default     = {}
}

variable "annotations" {
  description = "Additional annotations applied to the control-plane namespace."
  type        = map(string)
  default     = {}
}
