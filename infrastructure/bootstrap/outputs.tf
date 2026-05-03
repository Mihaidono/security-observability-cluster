output "state_bucket_name" {
  description = "S3 bucket storing Terraform state."
  value       = aws_s3_bucket.terraform_state.bucket
}

output "core_backend_config_snippet" {
  description = "Backend configuration values that match infrastructure/core/backend.hcl."
  value = {
    bucket  = aws_s3_bucket.terraform_state.bucket
    region  = var.region
    encrypt = true
    key     = "dev/core/terraform.tfstate"
  }
}

output "policies_backend_config_snippet" {
  description = "Backend configuration values that match infrastructure/policies/backend.hcl."
  value = {
    bucket  = aws_s3_bucket.terraform_state.bucket
    region  = var.region
    encrypt = true
    key     = "dev/policies/terraform.tfstate"
  }
}
