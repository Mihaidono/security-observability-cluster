variable "cluster_log_retention_in_days" {
  description = "Accepted for compatibility with the shared tfvars payload."
  type        = number
  default     = 90
}

variable "vpc_cidr" {
  description = "Accepted for compatibility with the shared tfvars payload."
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnets" {
  description = "Accepted for compatibility with the shared tfvars payload."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "public_subnets" {
  description = "Accepted for compatibility with the shared tfvars payload."
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24"]
}

variable "node_instance_types" {
  description = "Accepted for compatibility with the shared tfvars payload."
  type        = list(string)
  default     = ["t3.xlarge"]
}

variable "node_group_scaling" {
  description = "Accepted for compatibility with the shared tfvars payload."
  type = object({
    min_size     = number
    max_size     = number
    desired_size = number
  })
  default = {
    min_size     = 2
    max_size     = 5
    desired_size = 2
  }
}
