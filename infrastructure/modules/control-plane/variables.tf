variable "namespace" {
  description = "Namespace used for the Isolens control-plane workloads."
  type        = string
}

variable "create_namespace" {
  description = "Whether the control-plane module should create the namespace before deploying workloads."
  type        = bool
  default     = true
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

variable "backend_database_url" {
  description = "PostgreSQL connection string used by the backend workload."
  type        = string
  sensitive   = true
}

variable "public_app_url" {
  description = "Public base URL used by the frontend and Keycloak redirect flow."
  type        = string
}

variable "session_cookie_secure" {
  description = "Whether the backend session cookie should require HTTPS."
  type        = bool
  default     = true
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

variable "keycloak_name" {
  description = "Service and StatefulSet name for the in-cluster Keycloak deployment."
  type        = string
  default     = "isolens-keycloak"
}

variable "keycloak_image" {
  description = "Container image for the in-cluster Keycloak deployment."
  type        = string
  default     = "quay.io/keycloak/keycloak:26.6.4"
}

variable "keycloak_image_pull_policy" {
  description = "Image pull policy for the Keycloak container."
  type        = string
  default     = "IfNotPresent"
}

variable "keycloak_service_port" {
  description = "Service port exposed by the Keycloak service."
  type        = number
  default     = 8080
}

variable "keycloak_container_port" {
  description = "Container port exposed by the Keycloak workload."
  type        = number
  default     = 8080
}

variable "keycloak_admin_username" {
  description = "Bootstrap Keycloak admin username."
  type        = string
  default     = "admin"
}

variable "keycloak_admin_password" {
  description = "Bootstrap Keycloak admin password."
  type        = string
  sensitive   = true
}

variable "keycloak_realm" {
  description = "Keycloak realm used by the Isolens control plane."
  type        = string
  default     = "isolens"
}

variable "keycloak_client_id" {
  description = "OIDC client identifier used by the Isolens control plane."
  type        = string
  default     = "isolens-web"
}

variable "keycloak_client_secret" {
  description = "OIDC client secret used by the Isolens control plane."
  type        = string
  default     = ""
  sensitive   = true
}

variable "keycloak_database_host" {
  description = "Hostname of the PostgreSQL instance used by Keycloak."
  type        = string
}

variable "keycloak_database_port" {
  description = "Port of the PostgreSQL instance used by Keycloak."
  type        = number
  default     = 5432
}

variable "keycloak_database_name" {
  description = "Database name used by Keycloak."
  type        = string
}

variable "keycloak_database_username" {
  description = "Database username used by Keycloak."
  type        = string
}

variable "keycloak_database_password" {
  description = "Database password used by Keycloak."
  type        = string
  sensitive   = true
}

variable "keycloak_database_admin_database" {
  description = "Administrative PostgreSQL database used to bootstrap the Keycloak database and role."
  type        = string
}

variable "keycloak_database_admin_username" {
  description = "Administrative PostgreSQL username used to bootstrap the Keycloak database and role."
  type        = string
}

variable "keycloak_database_admin_password" {
  description = "Administrative PostgreSQL password used to bootstrap the Keycloak database and role."
  type        = string
  sensitive   = true
}

variable "keycloak_resources" {
  description = "Resource requests and limits for the Keycloak container."
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

variable "keycloak_database_bootstrap_resources" {
  description = "Resource requests and limits for the one-time Keycloak database bootstrap job."
  type = object({
    requests_cpu    = string
    requests_memory = string
    limits_cpu      = string
    limits_memory   = string
  })
  default = {
    requests_cpu    = "50m"
    requests_memory = "128Mi"
    limits_cpu      = "250m"
    limits_memory   = "256Mi"
  }
}
