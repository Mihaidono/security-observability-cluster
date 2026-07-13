resource "time_sleep" "cluster_access_ready" {
  create_duration = "45s"

  triggers = {
    cluster_name             = var.cluster_name
    cluster_endpoint         = data.aws_eks_cluster.this.endpoint
    cluster_admin_principals = join(",", sort(var.cluster_admin_principal_arns))
    subject_count            = tostring(length(var.analysis_subjects))
  }
}

module "policy_manifests" {
  source = "../../modules/policies-stack"

  analysis_subjects = var.analysis_subjects

  depends_on = [time_sleep.cluster_access_ready]
}
