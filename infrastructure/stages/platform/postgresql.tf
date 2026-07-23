module "postgresql" {
  source = "../../modules/platform-postgresql"

  name                       = var.postgresql_name
  database_name              = var.postgresql_database_name
  username                   = var.postgresql_username
  password                   = random_password.postgresql_password.result
  port                       = var.postgresql_port
  vpc_id                     = data.aws_vpc.cluster.id
  subnet_ids                 = data.aws_eks_cluster.this.vpc_config[0].subnet_ids
  allowed_security_group_ids = [data.aws_security_group.eks_nodes.id]
  instance_class             = var.postgresql_instance_class
  engine_version             = var.postgresql_engine_version
  allocated_storage          = var.postgresql_allocated_storage
  max_allocated_storage      = var.postgresql_max_allocated_storage
  storage_type               = var.postgresql_storage_type
  backup_retention_period    = var.postgresql_backup_retention_period
  backup_window              = var.postgresql_backup_window
  maintenance_window         = var.postgresql_maintenance_window
  multi_az                   = var.postgresql_multi_az
  deletion_protection        = var.postgresql_deletion_protection
  skip_final_snapshot        = var.postgresql_skip_final_snapshot
  apply_immediately          = var.postgresql_apply_immediately
  storage_encrypted          = var.postgresql_storage_encrypted
  tags = {
    Project     = var.project_name
    Environment = var.environment
    Stage       = "platform"
  }

  depends_on = [
    module.addons,
    kubernetes_namespace_v1.control_plane,
  ]
}
