variable "kubernetes_version" {
  description = "Cluster Kubernetes version used to label namespaces with the matching PSA version."
  type        = string
}

variable "ward_applications" {
  description = "Validated ward application definitions from the root module."
  type        = list(any)
}

variable "expose_hubble_ui" {
  description = "Whether to create a dedicated ingress endpoint for Hubble UI."
  type        = bool
  default     = true
}

variable "hubble_ui_host" {
  description = "Host used by the platform-managed Hubble UI ingress."
  type        = string
  default     = "hubble.lab.internal"
}

variable "hubble_ui_ingress_class_name" {
  description = "IngressClass name used by the platform-managed Hubble UI ingress."
  type        = string
  default     = "nginx"
}

variable "observability_ingress_whitelist_cidrs" {
  description = "Optional CIDR allowlist applied to observability ingresses through ingress-nginx whitelist annotations."
  type        = list(string)
  default     = []
}

variable "hubble_ui_ingress_annotations" {
  description = "Additional annotations merged onto the platform-managed Hubble UI ingress. Useful for auth integrations such as oauth2-proxy."
  type        = map(string)
  default     = {}
}
