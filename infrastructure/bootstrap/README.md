# Bootstrap Terraform Root

Creates the remote-state storage used by the other Terraform roots.

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
| [aws_s3_bucket.terraform_state](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/s3_bucket) | resource |
| [aws_s3_bucket_policy.terraform_state](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/s3_bucket_policy) | resource |
| [aws_s3_bucket_public_access_block.terraform_state](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/s3_bucket_public_access_block) | resource |
| [aws_s3_bucket_server_side_encryption_configuration.terraform_state](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/s3_bucket_server_side_encryption_configuration) | resource |
| [aws_s3_bucket_versioning.terraform_state](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/s3_bucket_versioning) | resource |
| [aws_iam_policy_document.terraform_state_tls_only](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/data-sources/iam_policy_document) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| environment | Environment identifier used for naming. | `string` | `"dev"` | no |
| force_destroy | Whether the state bucket can be destroyed even when non-empty. | `bool` | `false` | no |
| project_name | Project name used for bucket naming and tags. | `string` | `"isolens"` | no |
| region | AWS region where state storage resources will be created. | `string` | `"eu-north-1"` | no |
| state_bucket_name | Globally unique S3 bucket name for Terraform state. | `string` | `"isolens-lab"` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| applications_backend_config_snippet | Backend configuration values that match infrastructure/applications/backend.hcl. |
| core_backend_config_snippet | Backend configuration values that match infrastructure/core/backend.hcl. |
| platform_backend_config_snippet | Backend configuration values that match infrastructure/platform/backend.hcl. |
| policies_backend_config_snippet | Backend configuration values that match infrastructure/policies/backend.hcl. |
| state_bucket_name | S3 bucket storing Terraform state. |
<!-- END_TF_DOCS -->
