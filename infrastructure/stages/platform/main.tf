data "aws_iam_openid_connect_provider" "this" {
  url = data.aws_eks_cluster.this.identity[0].oidc[0].issuer
}

data "aws_vpc" "cluster" {
  id = data.aws_eks_cluster.this.vpc_config[0].vpc_id
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

module "subjects" {
  source = "../../modules/ward-subjects"

  analysis_subjects  = var.analysis_subjects
  kubernetes_version = var.kubernetes_version

  depends_on = [module.addons]
}

module "control_plane" {
  source = "../../modules/control-plane"

  namespace          = var.control_plane_namespace
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
  backend_database_url      = "postgresql://${var.postgresql_username}:${var.postgresql_password}@${var.postgresql_name}.${var.control_plane_namespace}.svc.cluster.local:${var.postgresql_service_port}/${var.postgresql_database_name}"
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

  depends_on = [module.addons]
}

module "postgresql" {
  source = "../../modules/platform-postgresql"

  namespace          = module.control_plane.namespace
  name               = var.postgresql_name
  database_name      = var.postgresql_database_name
  username           = var.postgresql_username
  password           = var.postgresql_password
  image              = var.postgresql_image
  storage_size       = var.postgresql_storage_size
  storage_class_name = var.postgresql_storage_class_name
  service_port       = var.postgresql_service_port
  resources          = var.postgresql_resources

  depends_on = [module.control_plane]
}
