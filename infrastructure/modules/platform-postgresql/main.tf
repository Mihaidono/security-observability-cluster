resource "aws_db_subnet_group" "postgresql" {
  name       = var.name
  subnet_ids = var.subnet_ids

  tags = local.labels
}

resource "aws_security_group" "postgresql" {
  name        = var.name
  description = "Security group for the Isolens PostgreSQL RDS instance."
  vpc_id      = var.vpc_id

  tags = local.labels
}

resource "aws_vpc_security_group_ingress_rule" "postgresql" {
  for_each = toset(var.allowed_cidr_blocks)

  security_group_id = aws_security_group.postgresql.id
  description       = "Allow PostgreSQL access from trusted cluster CIDRs."
  cidr_ipv4         = each.value
  from_port         = var.port
  ip_protocol       = "tcp"
  to_port           = var.port
}

resource "aws_vpc_security_group_ingress_rule" "postgresql_security_groups" {
  for_each = toset(var.allowed_security_group_ids)

  security_group_id            = aws_security_group.postgresql.id
  description                  = "Allow PostgreSQL access from trusted security groups."
  referenced_security_group_id = each.value
  from_port                    = var.port
  ip_protocol                  = "tcp"
  to_port                      = var.port
}

resource "aws_db_instance" "postgresql" {
  identifier                 = var.name
  db_name                    = var.database_name
  username                   = var.username
  password                   = var.password
  port                       = var.port
  engine                     = "postgres"
  engine_version             = var.engine_version
  instance_class             = var.instance_class
  allocated_storage          = var.allocated_storage
  max_allocated_storage      = var.max_allocated_storage
  storage_type               = var.storage_type
  db_subnet_group_name       = aws_db_subnet_group.postgresql.name
  vpc_security_group_ids     = [aws_security_group.postgresql.id]
  backup_retention_period    = var.backup_retention_period
  backup_window              = var.backup_window
  maintenance_window         = var.maintenance_window
  multi_az                   = var.multi_az
  deletion_protection        = var.deletion_protection
  skip_final_snapshot        = var.skip_final_snapshot
  final_snapshot_identifier  = var.skip_final_snapshot ? null : local.final_snapshot_identifier
  apply_immediately          = var.apply_immediately
  storage_encrypted          = var.storage_encrypted
  publicly_accessible        = false
  auto_minor_version_upgrade = true
  copy_tags_to_snapshot      = true

  tags = local.labels
}
