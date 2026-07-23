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
