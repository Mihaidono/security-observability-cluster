variable "analysis_subjects" {
  description = "Validated ward namespace definitions from the root module."
  type        = map(any)
}

variable "kubernetes_version" {
  description = "Cluster Kubernetes version used to label namespaces with the matching PSA version."
  type        = string
}
