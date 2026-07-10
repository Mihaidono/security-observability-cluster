# Bootstrap Terraform Root

Creates the remote-state storage and shared ECR repositories used by the other Terraform roots and CI workflows.

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| terraform | >= 1.7.0 |
| aws | 5.100.0 |

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [aws_ecr_lifecycle_policy.application_images](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/ecr_lifecycle_policy) | resource |
| [aws_ecr_repository.application_images](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/ecr_repository) | resource |
| [aws_s3_bucket.terraform_state](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/s3_bucket) | resource |
| [aws_s3_bucket_policy.terraform_state](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/s3_bucket_policy) | resource |
| [aws_s3_bucket_public_access_block.terraform_state](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/s3_bucket_public_access_block) | resource |
| [aws_s3_bucket_server_side_encryption_configuration.terraform_state](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/s3_bucket_server_side_encryption_configuration) | resource |
| [aws_s3_bucket_versioning.terraform_state](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/s3_bucket_versioning) | resource |
| [aws_iam_policy_document.terraform_state_tls_only](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| backend_ecr_repository_name | Name of the ECR repository that stores backend container images. | `string` | `"isolens-backend"` | no |
| ecr_image_tag_mutability | Tag mutability policy for the ECR repositories. Keep MUTABLE while the CI flow publishes the latest tag. | `string` | `"MUTABLE"` | no |
| ecr_scan_on_push | Whether ECR basic image scanning runs automatically when images are pushed. | `bool` | `true` | no |
| ecr_untagged_image_retention_days | Number of days to retain untagged images in the backend and frontend ECR repositories. | `number` | `7` | no |
| environment | Environment identifier used for naming. | `string` | `"dev"` | no |
| force_destroy | Whether the state bucket can be destroyed even when non-empty. | `bool` | `false` | no |
| frontend_ecr_repository_name | Name of the ECR repository that stores frontend container images. | `string` | `"isolens-frontend"` | no |
| project_name | Project name used for bucket naming and tags. | `string` | `"isolens"` | no |
| region | AWS region where state storage resources will be created. | `string` | `"eu-north-1"` | no |
| state_bucket_name | Globally unique S3 bucket name for Terraform state. | `string` | `"isolens-lab"` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| applications_backend_config_snippet | Backend configuration values that match infrastructure/applications/backend.hcl. |
| backend_ecr_repository_name | Name of the ECR repository that stores backend container images. |
| backend_ecr_repository_url | URL of the ECR repository that stores backend container images. |
| core_backend_config_snippet | Backend configuration values that match infrastructure/core/backend.hcl. |
| frontend_ecr_repository_name | Name of the ECR repository that stores frontend container images. |
| frontend_ecr_repository_url | URL of the ECR repository that stores frontend container images. |
| platform_backend_config_snippet | Backend configuration values that match infrastructure/platform/backend.hcl. |
| state_bucket_name | S3 bucket storing Terraform state. |
<!-- END_TF_DOCS -->
