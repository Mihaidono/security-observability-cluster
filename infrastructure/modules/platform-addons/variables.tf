variable "kubernetes_version" {
  description = "Cluster Kubernetes version used to label namespaces with the matching PSA version."
  type        = string
}

variable "ward_applications" {
  description = "Validated ward application definitions from the root module."
  type        = list(any)
}
