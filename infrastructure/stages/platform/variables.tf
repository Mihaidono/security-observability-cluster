variable "project_name" {
  description = "Logical project name used for tagging and naming."
  type        = string
  default     = "isolens"
}

variable "environment" {
  description = "Environment name used for tags and naming."
  type        = string
  default     = "lab"
}

variable "region" {
  description = "AWS region of the existing EKS cluster targeted by the platform stage."
  type        = string
  default     = "eu-north-1"
}

variable "cluster_name" {
  description = "Name of the existing EKS cluster targeted by the platform stage."
  type        = string
  default     = "forensic-lab"
}

variable "kubernetes_version" {
  description = "Cluster Kubernetes version used to label shared namespaces with the matching PSA version."
  type        = string
  default     = "1.35"
}

variable "cluster_admin_principal_arns" {
  description = "IAM principal ARNs granted cluster-admin access in the core stage. Used here to keep the post-core readiness wait tied to access configuration changes."
  type        = list(string)
  default     = []

  validation {
    condition     = length(var.cluster_admin_principal_arns) == length(toset(var.cluster_admin_principal_arns))
    error_message = "cluster_admin_principal_arns must not contain duplicate entries."
  }

  validation {
    condition     = alltrue([for arn in var.cluster_admin_principal_arns : can(regex("^arn:aws[a-z-]*:iam::[0-9]{12}:(role|user)/.+$", arn))])
    error_message = "cluster_admin_principal_arns must contain IAM role or user ARNs."
  }
}

variable "enable_ingress_nginx" {
  description = "Whether the shared nginx ingress controller should be installed by the platform layer."
  type        = bool
  default     = false
}

variable "gateway_api_crds_version" {
  description = "Pinned upstream Gateway API standard channel version applied before enabling Cilium Gateway API support."
  type        = string
  default     = "1.4.1"
}

variable "control_plane_namespace" {
  description = "Namespace reserved for the Isolens backend and frontend workloads."
  type        = string
  default     = "isolens-system"
}

variable "control_plane_namespace_labels" {
  description = "Additional labels applied to the control-plane namespace."
  type        = map(string)
  default     = {}
}

variable "control_plane_namespace_annotations" {
  description = "Additional annotations applied to the control-plane namespace."
  type        = map(string)
  default     = {}
}

variable "control_plane_backend_image" {
  description = "Container image for the control-plane backend workload."
  type        = string
  default     = "401262697743.dkr.ecr.eu-north-1.amazonaws.com/isolens-backend:latest"
}

variable "control_plane_backend_image_pull_policy" {
  description = "Image pull policy for the control-plane backend workload."
  type        = string
  default     = "IfNotPresent"
}

variable "control_plane_backend_replicas" {
  description = "Replica count for the control-plane backend workload."
  type        = number
  default     = 1
}

variable "control_plane_backend_service_name" {
  description = "Service name for the control-plane backend workload."
  type        = string
  default     = "isolens-backend"
}

variable "control_plane_backend_service_port" {
  description = "Service port for the control-plane backend workload."
  type        = number
  default     = 8000
}

variable "control_plane_backend_container_port" {
  description = "Container port for the control-plane backend workload."
  type        = number
  default     = 8000
}

variable "control_plane_backend_resources" {
  description = "Resource requests and limits for the control-plane backend container."
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

variable "control_plane_frontend_image" {
  description = "Container image for the control-plane frontend workload."
  type        = string
  default     = "401262697743.dkr.ecr.eu-north-1.amazonaws.com/isolens-frontend:latest"
}

variable "control_plane_frontend_image_pull_policy" {
  description = "Image pull policy for the control-plane frontend workload."
  type        = string
  default     = "IfNotPresent"
}

variable "control_plane_frontend_replicas" {
  description = "Replica count for the control-plane frontend workload."
  type        = number
  default     = 1
}

variable "control_plane_frontend_service_name" {
  description = "Service name for the control-plane frontend workload."
  type        = string
  default     = "isolens-frontend"
}

variable "control_plane_frontend_service_port" {
  description = "Service port for the control-plane frontend workload."
  type        = number
  default     = 80
}

variable "control_plane_frontend_container_port" {
  description = "Container port for the control-plane frontend workload."
  type        = number
  default     = 8080
}

variable "control_plane_frontend_resources" {
  description = "Resource requests and limits for the control-plane frontend container."
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

variable "control_plane_runner_name" {
  description = "Deployment name for the control-plane Terraform runner."
  type        = string
  default     = "isolens-runner"
}

variable "control_plane_runner_replicas" {
  description = "Replica count for the control-plane Terraform runner."
  type        = number
  default     = 1
}

variable "control_plane_runner_resources" {
  description = "Resource requests and limits for the control-plane Terraform runner container."
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

variable "control_plane_public_app_url" {
  description = "Public base URL of the control-plane frontend, used for Keycloak redirects and issuer URLs."
  type        = string
  default     = "http://localhost:5173"
}

variable "enable_control_plane_public_gateway" {
  description = "Whether to expose the control-plane frontend through a Cilium Gateway and create a Route53 record for it."
  type        = bool
  default     = false
}

variable "control_plane_public_hostname" {
  description = "Public DNS hostname for the control-plane frontend when the public gateway is enabled."
  type        = string
  default     = ""

  validation {
    condition     = (!var.enable_control_plane_public_gateway && var.control_plane_public_hostname == "") || (var.enable_control_plane_public_gateway && can(regex("^[A-Za-z0-9.-]+$", var.control_plane_public_hostname)))
    error_message = "control_plane_public_hostname must be a valid DNS hostname."
  }
}

variable "control_plane_public_tls_secret_name" {
  description = "Name of the TLS secret presented by the public Gateway listener."
  type        = string
  default     = ""

  validation {
    condition     = !var.enable_control_plane_public_gateway || trimspace(var.control_plane_public_tls_secret_name) != ""
    error_message = "control_plane_public_tls_secret_name must be set when the control-plane public gateway is enabled."
  }
}

variable "control_plane_route53_zone_id" {
  description = "Route53 hosted zone ID that should receive the control-plane frontend CNAME record."
  type        = string
  default     = ""

  validation {
    condition     = !var.enable_control_plane_public_gateway || trimspace(var.control_plane_route53_zone_id) != ""
    error_message = "control_plane_route53_zone_id must be set when the control-plane public gateway is enabled."
  }
}

variable "control_plane_route53_record_ttl" {
  description = "TTL in seconds for the public Route53 CNAME record."
  type        = number
  default     = 60
}

variable "control_plane_session_cookie_secure" {
  description = "Whether the backend session cookie should require HTTPS."
  type        = bool
  default     = true
}

variable "enable_shared_applications_gateway" {
  description = "Whether to create the shared Cilium Gateway used by application HTTPRoutes across ward namespaces."
  type        = bool
  default     = true
}

variable "shared_applications_gateway_name" {
  description = "Gateway name used for shared application exposure routes."
  type        = string
  default     = "isolens-applications"
}

variable "shared_applications_gateway_namespace" {
  description = "Namespace that owns the shared applications Gateway."
  type        = string
  default     = "isolens-system"
}

variable "keycloak_name" {
  description = "Service and StatefulSet name for the control-plane Keycloak deployment."
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
  description = "Optional OIDC client secret used by the Isolens control plane. Leave empty for a public PKCE client."
  type        = string
  default     = ""
  sensitive   = true
}

variable "keycloak_database_name" {
  description = "Database name created for Keycloak on the shared PostgreSQL instance."
  type        = string
  default     = "keycloak"

  validation {
    condition     = can(regex("^[A-Za-z0-9_]+$", var.keycloak_database_name))
    error_message = "keycloak_database_name must contain only letters, numbers, and underscores."
  }
}

variable "keycloak_database_username" {
  description = "Database username created for Keycloak on the shared PostgreSQL instance."
  type        = string
  default     = "keycloak"

  validation {
    condition     = can(regex("^[A-Za-z0-9_]+$", var.keycloak_database_username))
    error_message = "keycloak_database_username must contain only letters, numbers, and underscores."
  }
}

variable "postgresql_name" {
  description = "Base name used for the RDS PostgreSQL resources."
  type        = string
  default     = "isolens-postgresql"
}

variable "postgresql_database_name" {
  description = "Database name created for the control plane."
  type        = string
  default     = "isolens"
}

variable "postgresql_username" {
  description = "Application username created for the control plane database."
  type        = string
  default     = "isolens"
}

variable "postgresql_port" {
  description = "Port exposed by PostgreSQL."
  type        = number
  default     = 5432
}

variable "postgresql_instance_class" {
  description = "RDS instance class for the control-plane PostgreSQL database."
  type        = string
  default     = "db.t3.medium"
}

variable "postgresql_engine_version" {
  description = "PostgreSQL engine version. Null lets AWS choose the default version for the selected engine family."
  type        = string
  default     = null
  nullable    = true
}

variable "postgresql_allocated_storage" {
  description = "Allocated storage in GiB for PostgreSQL."
  type        = number
  default     = 20
}

variable "postgresql_max_allocated_storage" {
  description = "Upper limit in GiB for PostgreSQL storage autoscaling."
  type        = number
  default     = 100
}

variable "postgresql_storage_type" {
  description = "RDS storage type."
  type        = string
  default     = "gp3"
}

variable "postgresql_backup_retention_period" {
  description = "Number of days to retain automated backups."
  type        = number
  default     = 7
}

variable "postgresql_backup_window" {
  description = "Preferred daily backup window in UTC."
  type        = string
  default     = "03:00-04:00"
}

variable "postgresql_maintenance_window" {
  description = "Preferred weekly maintenance window in UTC."
  type        = string
  default     = "sun:04:30-sun:05:30"
}

variable "postgresql_multi_az" {
  description = "Whether to provision a Multi-AZ standby for PostgreSQL."
  type        = bool
  default     = true
}

variable "postgresql_deletion_protection" {
  description = "Whether to enable deletion protection on PostgreSQL."
  type        = bool
  default     = false
}

variable "postgresql_skip_final_snapshot" {
  description = "Whether to skip the final snapshot when destroying PostgreSQL."
  type        = bool
  default     = true
}

variable "postgresql_apply_immediately" {
  description = "Whether PostgreSQL modifications should be applied immediately."
  type        = bool
  default     = true
}

variable "postgresql_storage_encrypted" {
  description = "Whether to enable storage encryption for PostgreSQL."
  type        = bool
  default     = true
}
