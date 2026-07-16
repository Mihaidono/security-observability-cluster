data "aws_iam_openid_connect_provider" "this" {
  url = data.aws_eks_cluster.this.identity[0].oidc[0].issuer
}

data "aws_vpc" "cluster" {
  id = data.aws_eks_cluster.this.vpc_config[0].vpc_id
}

data "aws_security_group" "eks_nodes" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.cluster.id]
  }

  filter {
    name   = "tag:Name"
    values = ["${var.cluster_name}-node"]
  }

  filter {
    name   = "tag:kubernetes.io/cluster/${var.cluster_name}"
    values = ["owned"]
  }
}

data "aws_iam_policy_document" "cilium_operator_assume_role" {
  statement {
    sid     = "AllowCiliumOperatorWebIdentity"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.this.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${replace(data.aws_eks_cluster.this.identity[0].oidc[0].issuer, "https://", "")}:sub"
      values   = ["system:serviceaccount:kube-system:cilium-operator"]
    }

    condition {
      test     = "StringEquals"
      variable = "${replace(data.aws_eks_cluster.this.identity[0].oidc[0].issuer, "https://", "")}:aud"
      values   = ["sts.amazonaws.com"]
    }
  }
}

data "aws_iam_policy_document" "cilium_operator" {
  statement {
    sid = "AllowCiliumEniManagement"
    actions = [
      "ec2:AssignPrivateIpAddresses",
      "ec2:AttachNetworkInterface",
      "ec2:CreateNetworkInterface",
      "ec2:CreateTags",
      "ec2:DeleteNetworkInterface",
      "ec2:DescribeInstanceTypes",
      "ec2:DescribeNetworkInterfaces",
      "ec2:DescribeRouteTables",
      "ec2:DescribeSecurityGroups",
      "ec2:DescribeSubnets",
      "ec2:DescribeTags",
      "ec2:DescribeVpcs",
      "ec2:ModifyNetworkInterfaceAttribute",
    ]
    resources = ["*"]
  }
}

resource "aws_iam_policy" "cilium_operator" {
  name        = "${var.project_name}-${var.environment}-cilium-operator"
  description = "Least-privilege EC2 permissions for the Cilium operator in ENI mode."
  policy      = data.aws_iam_policy_document.cilium_operator.json
}

resource "aws_iam_role" "cilium_operator" {
  name               = "${var.project_name}-${var.environment}-cilium-operator"
  assume_role_policy = data.aws_iam_policy_document.cilium_operator_assume_role.json
  description        = "IRSA role for the Cilium operator running in kube-system."
}

resource "aws_iam_role_policy_attachment" "cilium_operator" {
  role       = aws_iam_role.cilium_operator.name
  policy_arn = aws_iam_policy.cilium_operator.arn
}

resource "time_sleep" "cluster_access_ready" {
  create_duration = "45s"

  triggers = {
    cluster_name             = var.cluster_name
    cluster_endpoint         = data.aws_eks_cluster.this.endpoint
    cluster_admin_principals = join(",", sort(var.cluster_admin_principal_arns))
  }
}

resource "kubernetes_namespace_v1" "control_plane" {
  metadata {
    name = var.control_plane_namespace
    labels = merge({
      "pod-security.kubernetes.io/enforce"         = "baseline"
      "pod-security.kubernetes.io/enforce-version" = startswith(var.kubernetes_version, "v") || var.kubernetes_version == "latest" ? var.kubernetes_version : "v${var.kubernetes_version}"
      "isolens.io/component"                       = "control-plane"
      "app.kubernetes.io/part-of"                  = "isolens"
    }, var.control_plane_namespace_labels)
    annotations = var.control_plane_namespace_annotations
  }

  depends_on = [time_sleep.cluster_access_ready]
}

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

module "control_plane" {
  source = "../../modules/control-plane"

  namespace          = var.control_plane_namespace
  create_namespace   = false
  kubernetes_version = var.kubernetes_version
  labels             = var.control_plane_namespace_labels
  annotations        = var.control_plane_namespace_annotations

  backend_image             = var.control_plane_backend_image
  backend_image_pull_policy = var.control_plane_backend_image_pull_policy
  backend_replicas          = var.control_plane_backend_replicas
  backend_service_name      = var.control_plane_backend_service_name
  backend_service_port      = var.control_plane_backend_service_port
  backend_container_port    = var.control_plane_backend_container_port
  backend_api_token         = var.control_plane_backend_api_token
  backend_database_url      = "postgresql://${var.postgresql_username}:${var.postgresql_password}@${module.postgresql.address}:${module.postgresql.port}/${var.postgresql_database_name}?sslmode=require"
  backend_resources         = var.control_plane_backend_resources

  frontend_image             = var.control_plane_frontend_image
  frontend_image_pull_policy = var.control_plane_frontend_image_pull_policy
  frontend_replicas          = var.control_plane_frontend_replicas
  frontend_service_name      = var.control_plane_frontend_service_name
  frontend_service_port      = var.control_plane_frontend_service_port
  frontend_container_port    = var.control_plane_frontend_container_port
  frontend_resources         = var.control_plane_frontend_resources

  runner_name      = var.control_plane_runner_name
  runner_replicas  = var.control_plane_runner_replicas
  runner_resources = var.control_plane_runner_resources

  depends_on = [
    module.addons,
    kubernetes_namespace_v1.control_plane,
    module.postgresql,
  ]
}

module "postgresql" {
  source = "../../modules/platform-postgresql"

  name                       = var.postgresql_name
  database_name              = var.postgresql_database_name
  username                   = var.postgresql_username
  password                   = var.postgresql_password
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
