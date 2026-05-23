variable "project_name" {
  description = "Logical project name used for tagging and cluster naming."
  type        = string
  default     = "isolens"
}

variable "environment" {
  description = "Environment name used for tags and naming."
  type        = string
  default     = "lab"
}

variable "region" {
  description = "AWS region where the core stage creates the VPC, EKS cluster, and stage-owned AWS resources."
  type        = string
  default     = "eu-north-1"
}

variable "cluster_name" {
  description = "Name of the EKS cluster created by the core stage."
  type        = string
  default     = "forensic-lab"
}

variable "kubernetes_version" {
  description = "Kubernetes minor version requested for the EKS control plane."
  type        = string
  default     = "1.35"
}

variable "cluster_log_retention_in_days" {
  description = "Retention period, in days, for the EKS control-plane CloudWatch log group."
  type        = number
  default     = 90

  validation {
    condition = contains([
      1,
      3,
      5,
      7,
      14,
      30,
      60,
      90,
      120,
      150,
      180,
      365,
      400,
      545,
      731,
      1096,
      1827,
      2192,
      2557,
      2922,
      3288,
      3653,
    ], var.cluster_log_retention_in_days)
    error_message = "cluster_log_retention_in_days must be a supported CloudWatch Logs retention value."
  }
}

variable "vpc_cidr" {
  description = "CIDR block for the lab VPC."
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "vpc_cidr must be a valid IPv4 CIDR block."
  }
}

variable "private_subnets" {
  description = "Private subnet CIDRs for worker nodes."
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]

  validation {
    condition     = length(var.private_subnets) == 2 && length(toset(var.private_subnets)) == 2 && alltrue([for cidr in var.private_subnets : can(cidrhost(cidr, 0))])
    error_message = "private_subnets must contain exactly two unique valid CIDR blocks to match the two configured availability zones."
  }
}

variable "public_subnets" {
  description = "Public subnet CIDRs for load balancers and NAT."
  type        = list(string)
  default     = ["10.0.101.0/24", "10.0.102.0/24"]

  validation {
    condition     = length(var.public_subnets) == 2 && length(toset(var.public_subnets)) == 2 && alltrue([for cidr in var.public_subnets : can(cidrhost(cidr, 0))])
    error_message = "public_subnets must contain exactly two unique valid CIDR blocks to match the two configured availability zones."
  }
}

variable "node_instance_types" {
  description = "Worker node instance types."
  type        = list(string)
  default     = ["t3.xlarge"]
}

variable "node_group_scaling" {
  description = "Managed node group scaling configuration."
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

  validation {
    condition     = var.node_group_scaling.min_size <= var.node_group_scaling.desired_size && var.node_group_scaling.desired_size <= var.node_group_scaling.max_size
    error_message = "node_group_scaling must satisfy min_size <= desired_size <= max_size."
  }
}

variable "cluster_admin_principal_arns" {
  description = "IAM principal ARNs granted EKS cluster-admin access through access entries so the later platform and policies stages can manage in-cluster resources safely."
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
