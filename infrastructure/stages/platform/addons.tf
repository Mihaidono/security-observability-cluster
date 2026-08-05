module "addons" {
  source = "../../modules/platform-addons"

  kubernetes_version                   = var.kubernetes_version
  cluster_name                         = var.cluster_name
  cluster_endpoint                     = data.aws_eks_cluster.this.endpoint
  cluster_vpc_cidr                     = data.aws_vpc.cluster.cidr_block
  cilium_operator_iam_role_arn         = aws_iam_role.cilium_operator.arn
  cluster_access_ready_id              = time_sleep.cluster_access_ready.id
  cilium_operator_policy_attachment_id = aws_iam_role_policy_attachment.cilium_operator.id
  enable_ingress_nginx                 = var.enable_ingress_nginx
}
