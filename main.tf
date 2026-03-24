module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "security-lab-vpc"
  cidr = "10.0.0.0/16"
  azs  = ["${var.region}a", "${var.region}b"]
  
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24"]

  enable_nat_gateway = true
  single_nat_gateway = true
}

module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = "forensic-lab"
  cluster_version = "1.35" # Latest 2026 stable

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  # Enable OIDC for IRSA (IAM Roles for Service Accounts)
  enable_irsa = true

  eks_managed_node_groups = {
    standard = {
      instance_types = ["t3.xlarge"] # Tetragon/eBPF needs some CPU/RAM
      min_size     = 2
      max_size     = 5
      desired_size = 2

      # CRITICAL: Taint nodes so Cilium can initialize first
      taints = [{
        key    = "node.cilium.io/agent-not-ready"
        value  = "true"
        effect = "NO_EXECUTE"
      }]
    }
  }
}