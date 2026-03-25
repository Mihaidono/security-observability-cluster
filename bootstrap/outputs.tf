output "state_bucket_name" {
  description = "S3 bucket storing Terraform state."
  value       = aws_s3_bucket.terraform_state.bucket
}

output "backend_config_snippet" {
  description = "Backend configuration values to copy into the root stack."
  value = {
    bucket  = aws_s3_bucket.terraform_state.bucket
    region  = var.region
    encrypt = true
    key     = "${var.project_name}/${var.environment}/terraform.tfstate"
  }
}
