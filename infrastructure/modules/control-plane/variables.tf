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

variable "backend_image" {
  description = "Container image for the Isolens backend workload."
  type        = string
}

variable "backend_image_pull_policy" {
  description = "Image pull policy for the backend container."
  type        = string
  default     = "IfNotPresent"
}

variable "backend_replicas" {
  description = "Replica count for the backend workload."
  type        = number
  default     = 1
}

variable "backend_service_name" {
  description = "ClusterIP Service name for the backend workload."
  type        = string
  default     = "isolens-backend"
}

variable "backend_service_port" {
  description = "Service port exposed by the backend ClusterIP Service."
  type        = number
  default     = 8000
}

variable "backend_container_port" {
  description = "Container port exposed by the backend workload."
  type        = number
  default     = 8000
}

variable "backend_api_token" {
  description = "Bearer token required by the backend API."
  type        = string
  sensitive   = true
}

variable "backend_database_url" {
  description = "PostgreSQL connection string used by the backend workload."
  type        = string
  sensitive   = true
}

variable "backend_resources" {
  description = "Resource requests and limits for the backend container."
  type = object({
    requests_cpu    = string
    requests_memory = string
    limits_cpu      = string
    limits_memory   = string
  })
  default = {
    requests_cpu    = "250m"
    requests_memory = "512Mi"
    limits_cpu      = "1000m"
    limits_memory   = "1Gi"
  }
}

variable "frontend_image" {
  description = "Container image for the Isolens frontend workload."
  type        = string
}

variable "frontend_image_pull_policy" {
  description = "Image pull policy for the frontend container."
  type        = string
  default     = "IfNotPresent"
}

variable "frontend_replicas" {
  description = "Replica count for the frontend workload."
  type        = number
  default     = 1
}

variable "frontend_service_name" {
  description = "Service name for the frontend workload."
  type        = string
  default     = "isolens-frontend"
}

variable "frontend_service_port" {
  description = "Service port exposed by the frontend Service."
  type        = number
  default     = 80
}

variable "frontend_container_port" {
  description = "Container port exposed by the frontend workload."
  type        = number
  default     = 8080
}

variable "frontend_resources" {
  description = "Resource requests and limits for the frontend container."
  type = object({
    requests_cpu    = string
    requests_memory = string
    limits_cpu      = string
    limits_memory   = string
  })
  default = {
    requests_cpu    = "100m"
    requests_memory = "128Mi"
    limits_cpu      = "500m"
    limits_memory   = "256Mi"
  }
}

variable "runner_name" {
  description = "Deployment name for the Terraform runner workload."
  type        = string
  default     = "isolens-runner"
}

variable "runner_replicas" {
  description = "Replica count for the Terraform runner workload."
  type        = number
  default     = 2
}

variable "runner_resources" {
  description = "Resource requests and limits for the Terraform runner container."
  type = object({
    requests_cpu    = string
    requests_memory = string
    limits_cpu      = string
    limits_memory   = string
  })
  default = {
    requests_cpu    = "250m"
    requests_memory = "512Mi"
    limits_cpu      = "1000m"
    limits_memory   = "1Gi"
  }
}
