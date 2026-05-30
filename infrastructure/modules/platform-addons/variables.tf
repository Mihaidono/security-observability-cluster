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

variable "enable_observability_identity" {
  description = "Whether to install the platform-managed Keycloak and oauth2-proxy stack for observability endpoints."
  type        = bool
  default     = true
}

variable "protect_hubble_ui_with_identity" {
  description = "Whether the dedicated Hubble UI ingress should require oauth2-proxy authentication."
  type        = bool
  default     = true
}

variable "keycloak_host" {
  description = "Host exposed through ingress-nginx for the platform-managed Keycloak endpoint."
  type        = string
  default     = "keycloak.lab.internal"
}

variable "oauth2_proxy_host" {
  description = "Host exposed through ingress-nginx for the platform-managed oauth2-proxy endpoint."
  type        = string
  default     = "auth.lab.internal"
}

variable "observability_realm_name" {
  description = "Keycloak realm used for protecting observability endpoints."
  type        = string
  default     = "isolens-observability"
}

variable "observability_allowed_group" {
  description = "Keycloak group path required by oauth2-proxy for observability access."
  type        = string
  default     = "/observability-users"
}

variable "observability_demo_username" {
  description = "Bootstrap Keycloak user created for observability demos."
  type        = string
  default     = "observer"
}

variable "observability_demo_email" {
  description = "Bootstrap Keycloak user email created for observability demos."
  type        = string
  default     = "observer@lab.internal"
}
