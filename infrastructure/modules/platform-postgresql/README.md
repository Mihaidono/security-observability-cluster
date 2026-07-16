# Platform PostgreSQL Module

Creates the private Amazon RDS for PostgreSQL instance used by the Isolens control plane.

## Implementation Notes

- The database is provisioned inside the cluster VPC through a dedicated DB subnet group.
- The instance is not publicly accessible.
- Storage encryption, automated backups, Multi-AZ, and storage autoscaling are configurable from the calling stage.
- Network access should be granted through security group references, not broad VPC CIDR rules.
- The current platform stage wires this module to the EKS worker-node security group so only worker-node ENIs can reach `tcp/5432`.
- Pod-level restriction is still expected to be enforced separately through Cilium network policy.

## Operational Model

This module is intentionally AWS-native:

- no in-cluster StatefulSet
- no Kubernetes Service for PostgreSQL
- no PersistentVolume lifecycle inside the cluster
- no database pod scheduling dependency during platform bootstrap

That keeps the control-plane database outside the failure domain of cluster node churn and add-on bootstrap ordering.

## Security Notes

- `allowed_security_group_ids` is the preferred access control mechanism.
- `allowed_cidr_blocks` remains available as a fallback, but should be avoided unless there is a clear operational reason.
- Client-side TLS should be enforced by the application connection string.

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
| [aws_db_instance.postgresql](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/db_instance) | resource |
| [aws_db_subnet_group.postgresql](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/db_subnet_group) | resource |
| [aws_security_group.postgresql](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/security_group) | resource |
| [aws_vpc_security_group_ingress_rule.postgresql](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/vpc_security_group_ingress_rule) | resource |
| [aws_vpc_security_group_ingress_rule.postgresql_security_groups](https://registry.terraform.io/providers/hashicorp/aws/5.100.0/docs/resources/vpc_security_group_ingress_rule) | resource |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| allocated_storage | Allocated storage in GiB for the PostgreSQL instance. | `number` | `20` | no |
| allowed_cidr_blocks | CIDR blocks allowed to connect to PostgreSQL. Leave empty when access is restricted through security group references. | `list(string)` | `[]` | no |
| allowed_security_group_ids | Security group IDs allowed to connect to PostgreSQL. | `list(string)` | `[]` | no |
| apply_immediately | Whether modifications should be applied immediately. | `bool` | `true` | no |
| backup_retention_period | Number of days to retain automated backups. | `number` | `7` | no |
| backup_window | Preferred daily backup window in UTC. | `string` | `"03:00-04:00"` | no |
| database_name | Database name created for the control plane. | `string` | `"isolens"` | no |
| deletion_protection | Whether to enable deletion protection on the PostgreSQL instance. | `bool` | `false` | no |
| engine_version | PostgreSQL engine version. Null lets AWS choose the default version for the selected engine family. | `string` | `null` | no |
| instance_class | RDS instance class for the PostgreSQL control-plane database. | `string` | `"db.t3.medium"` | no |
| maintenance_window | Preferred weekly maintenance window in UTC. | `string` | `"sun:04:30-sun:05:30"` | no |
| max_allocated_storage | Upper limit in GiB for PostgreSQL storage autoscaling. | `number` | `100` | no |
| multi_az | Whether to provision a Multi-AZ standby for the PostgreSQL instance. | `bool` | `true` | no |
| name | Base name used for the RDS PostgreSQL resources. | `string` | `"isolens-postgresql"` | no |
| password | Application password used by the RDS PostgreSQL instance. | `string` | `"isolens-dev-password-change-me"` | no |
| port | PostgreSQL listener port. | `number` | `5432` | no |
| skip_final_snapshot | Whether to skip the final snapshot when destroying the PostgreSQL instance. | `bool` | `true` | no |
| storage_encrypted | Whether to enable storage encryption for PostgreSQL. | `bool` | `true` | no |
| storage_type | RDS storage type. | `string` | `"gp3"` | no |
| subnet_ids | Private subnet IDs used by the RDS subnet group. | `list(string)` | n/a | yes |
| tags | Additional tags applied to the RDS resources. | `map(string)` | `{}` | no |
| username | Application username created for the control plane database. | `string` | `"isolens"` | no |
| vpc_id | VPC identifier where the RDS instance is provisioned. | `string` | n/a | yes |

## Outputs

| Name | Description |
| ---- | ----------- |
| address | DNS address of the RDS PostgreSQL instance. |
| database_name | Application database name. |
| endpoint | Endpoint of the RDS PostgreSQL instance in host:port form. |
| port | Port exposed by the RDS PostgreSQL instance. |
| security_group_id | Security group attached to the RDS PostgreSQL instance. |
| username | Application username for PostgreSQL. |
<!-- END_TF_DOCS -->
