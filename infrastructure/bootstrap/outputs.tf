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
