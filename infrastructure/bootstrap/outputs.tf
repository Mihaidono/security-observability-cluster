output "state_bucket_name" {
  description = "S3 bucket storing Terraform state."
  value       = aws_s3_bucket.terraform_state.bucket
}

output "core_backend_config_snippet" {
  description = "Backend configuration values that match infrastructure/core/backend.hcl."
  value = {
    bucket       = aws_s3_bucket.terraform_state.bucket
    region       = var.region
    encrypt      = true
    key          = "dev/core/terraform.tfstate"
    use_lockfile = true
  }
}

output "platform_backend_config_snippet" {
  description = "Backend configuration values that match infrastructure/platform/backend.hcl."
  value = {
    bucket       = aws_s3_bucket.terraform_state.bucket
    region       = var.region
    encrypt      = true
    key          = "dev/platform/terraform.tfstate"
    use_lockfile = true
  }
}

output "applications_backend_config_snippet" {
  description = "Backend configuration values that match infrastructure/applications/backend.hcl."
  value = {
    bucket       = aws_s3_bucket.terraform_state.bucket
    region       = var.region
    encrypt      = true
    key          = "dev/applications/terraform.tfstate"
    use_lockfile = true
  }
}

output "backend_ecr_repository_name" {
  description = "Name of the ECR repository that stores backend container images."
  value       = aws_ecr_repository.application_images["backend"].name
}

output "backend_ecr_repository_url" {
  description = "URL of the ECR repository that stores backend container images."
  value       = aws_ecr_repository.application_images["backend"].repository_url
}

output "frontend_ecr_repository_name" {
  description = "Name of the ECR repository that stores frontend container images."
  value       = aws_ecr_repository.application_images["frontend"].name
}

output "frontend_ecr_repository_url" {
  description = "URL of the ECR repository that stores frontend container images."
  value       = aws_ecr_repository.application_images["frontend"].repository_url
}
