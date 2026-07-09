output "cluster_name" {
  description = "Name of the provisioned EKS cluster."
  value       = module.eks.cluster_name
}

output "backend_ecr_repository_name" {
  description = "Name of the ECR repository that stores backend container images."
  value       = aws_ecr_repository.application_images["backend"].name
}

output "backend_ecr_repository_url" {
  description = "URL of the ECR repository that stores backend container images."
  value       = aws_ecr_repository.application_images["backend"].repository_url
}

output "cluster_endpoint" {
  description = "EKS API server endpoint."
  value       = module.eks.cluster_endpoint
}

output "cluster_security_group_id" {
  description = "Security group attached to the EKS control plane."
  value       = module.eks.cluster_security_group_id
}

output "cluster_log_group_name" {
  description = "CloudWatch log group receiving EKS control-plane logs."
  value       = aws_cloudwatch_log_group.eks_cluster.name
}

output "frontend_ecr_repository_name" {
  description = "Name of the ECR repository that stores frontend container images."
  value       = aws_ecr_repository.application_images["frontend"].name
}

output "frontend_ecr_repository_url" {
  description = "URL of the ECR repository that stores frontend container images."
  value       = aws_ecr_repository.application_images["frontend"].repository_url
}

output "update_kubeconfig_command" {
  description = "Command to merge this cluster into the local kubeconfig."
  value       = "aws eks update-kubeconfig --region ${var.region} --name ${module.eks.cluster_name}"
}
