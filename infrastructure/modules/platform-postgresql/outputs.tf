output "address" {
  description = "DNS address of the RDS PostgreSQL instance."
  value       = aws_db_instance.postgresql.address
}

output "endpoint" {
  description = "Endpoint of the RDS PostgreSQL instance in host:port form."
  value       = aws_db_instance.postgresql.endpoint
}

output "port" {
  description = "Port exposed by the RDS PostgreSQL instance."
  value       = aws_db_instance.postgresql.port
}

output "database_name" {
  description = "Application database name."
  value       = var.database_name
}

output "username" {
  description = "Application username for PostgreSQL."
  value       = var.username
}

output "security_group_id" {
  description = "Security group attached to the RDS PostgreSQL instance."
  value       = aws_security_group.postgresql.id
}
