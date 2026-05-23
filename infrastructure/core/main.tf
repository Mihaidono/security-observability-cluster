resource "aws_cloudwatch_log_group" "eks_cluster" {
  name              = "/aws/eks/${var.cluster_name}/cluster"
  retention_in_days = var.cluster_log_retention_in_days

  tags = {
    Blueprint = "isolens"
  }
}

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "5.21.0"

  name = "${var.project_name}-${var.environment}-vpc"
  cidr = var.vpc_cidr
  azs  = ["${var.region}a", "${var.region}b"]

  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets

  enable_nat_gateway = true
  single_nat_gateway = true

  tags = {
    Blueprint = "isolens"
  }
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "20.37.2"

  cluster_name    = var.cluster_name
  cluster_version = var.kubernetes_version

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  enable_irsa                    = true
  cluster_enabled_log_types      = ["api", "audit", "authenticator", "controllerManager", "scheduler"]
  cluster_endpoint_public_access = true
  create_cloudwatch_log_group    = false

  eks_managed_node_groups = {
    standard = {
      instance_types = var.node_instance_types
      min_size       = var.node_group_scaling.min_size
      max_size       = var.node_group_scaling.max_size
      desired_size   = var.node_group_scaling.desired_size

      taints = [{
        key    = "node.cilium.io/agent-not-ready"
        value  = "true"
        effect = "NO_EXECUTE"
      }]
    }
  }

  tags = {
    Blueprint = "isolens"
  }

  depends_on = [aws_cloudwatch_log_group.eks_cluster]
}

resource "aws_eks_access_entry" "cluster_admins" {
  for_each = toset(var.cluster_admin_principal_arns)

  cluster_name  = module.eks.cluster_name
  principal_arn = each.value
  type          = "STANDARD"
}

resource "aws_eks_access_policy_association" "cluster_admins" {
  for_each = toset(var.cluster_admin_principal_arns)

  cluster_name  = module.eks.cluster_name
  principal_arn = each.value
  policy_arn    = "arn:aws:eks::aws:cluster-access-policy/AmazonEKSClusterAdminPolicy"

  access_scope {
    type = "cluster"
  }

  depends_on = [aws_eks_access_entry.cluster_admins]
}

resource "time_sleep" "cluster_access_ready" {
  create_duration = "45s"

  triggers = {
    cluster_name             = module.eks.cluster_name
    cluster_endpoint         = module.eks.cluster_endpoint
    cluster_admin_principals = join(",", sort(var.cluster_admin_principal_arns))
  }

  depends_on = [
    module.eks,
    aws_eks_access_policy_association.cluster_admins,
  ]
}

module "addons" {
  source = "../modules/core-addons"

  kubernetes_version = var.kubernetes_version
  ward_applications  = var.ward_applications

  depends_on = [time_sleep.cluster_access_ready]
}

module "subjects" {
  source = "../modules/ward-subjects"

  analysis_subjects  = var.analysis_subjects
  kubernetes_version = var.kubernetes_version

  depends_on = [time_sleep.cluster_access_ready]
}

module "workloads" {
  source = "../modules/ward-workloads"

  analysis_subject_names = toset(keys(var.analysis_subjects))
  ward_applications      = var.ward_applications

  depends_on = [
    module.addons,
    module.subjects,
  ]
}
