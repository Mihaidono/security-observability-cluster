variable "name" {
  description = "Base name used for the RDS PostgreSQL resources."
  type        = string
  default     = "isolens-postgresql"
}

variable "database_name" {
  description = "Database name created for the control plane."
  type        = string
  default     = "isolens"
}

variable "username" {
  description = "Application username created for the control plane database."
  type        = string
  default     = "isolens"
}

variable "password" {
  description = "Application password used by the RDS PostgreSQL instance."
  type        = string
  sensitive   = true
  default     = "isolens-dev-password-change-me"
}

variable "port" {
  description = "PostgreSQL listener port."
  type        = number
  default     = 5432
}

variable "vpc_id" {
  description = "VPC identifier where the RDS instance is provisioned."
  type        = string
}

variable "subnet_ids" {
  description = "Private subnet IDs used by the RDS subnet group."
  type        = list(string)
}

variable "allowed_cidr_blocks" {
  description = "CIDR blocks allowed to connect to PostgreSQL. Leave empty when access is restricted through security group references."
  type        = list(string)
  default     = []
}

variable "allowed_security_group_ids" {
  description = "Security group IDs allowed to connect to PostgreSQL."
  type        = list(string)
  default     = []
}

variable "instance_class" {
  description = "RDS instance class for the PostgreSQL control-plane database."
  type        = string
  default     = "db.t3.medium"
}

variable "engine_version" {
  description = "PostgreSQL engine version. Null lets AWS choose the default version for the selected engine family."
  type        = string
  default     = null
  nullable    = true
}

variable "allocated_storage" {
  description = "Allocated storage in GiB for the PostgreSQL instance."
  type        = number
  default     = 20
}

variable "max_allocated_storage" {
  description = "Upper limit in GiB for PostgreSQL storage autoscaling."
  type        = number
  default     = 100
}

variable "storage_type" {
  description = "RDS storage type."
  type        = string
  default     = "gp3"
}

variable "backup_retention_period" {
  description = "Number of days to retain automated backups."
  type        = number
  default     = 7
}

variable "backup_window" {
  description = "Preferred daily backup window in UTC."
  type        = string
  default     = "03:00-04:00"
}

variable "maintenance_window" {
  description = "Preferred weekly maintenance window in UTC."
  type        = string
  default     = "sun:04:30-sun:05:30"
}

variable "multi_az" {
  description = "Whether to provision a Multi-AZ standby for the PostgreSQL instance."
  type        = bool
  default     = true
}

variable "deletion_protection" {
  description = "Whether to enable deletion protection on the PostgreSQL instance."
  type        = bool
  default     = false
}

variable "skip_final_snapshot" {
  description = "Whether to skip the final snapshot when destroying the PostgreSQL instance."
  type        = bool
  default     = true
}

variable "apply_immediately" {
  description = "Whether modifications should be applied immediately."
  type        = bool
  default     = true
}

variable "storage_encrypted" {
  description = "Whether to enable storage encryption for PostgreSQL."
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags applied to the RDS resources."
  type        = map(string)
  default     = {}
}
