variable "analysis_subjects" {
  description = "Validated ward namespace definitions from the root module."
  type        = map(any)
}

variable "kyverno_cluster_policies" {
  description = "Kyverno ClusterPolicy manifests managed by the policies module."
  type        = any
  default     = []
}

variable "tetragon_tracing_policies" {
  description = "Tetragon tracing policy manifests managed by the policies module."
  type        = any
  default     = []
}
