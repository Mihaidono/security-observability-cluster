module "addons" {
  source = "../../modules/platform-addons"

  kubernetes_version           = var.kubernetes_version
  cluster_name                 = var.cluster_name
  cluster_endpoint             = data.aws_eks_cluster.this.endpoint
  cluster_vpc_cidr             = data.aws_vpc.cluster.cidr_block
  cilium_operator_iam_role_arn = aws_iam_role.cilium_operator.arn
  enable_ingress_nginx         = var.enable_ingress_nginx

  depends_on = [
    time_sleep.cluster_access_ready,
    aws_iam_role_policy_attachment.cilium_operator,
  ]
}
