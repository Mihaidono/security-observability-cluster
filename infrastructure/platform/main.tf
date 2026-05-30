resource "time_sleep" "cluster_access_ready" {
  create_duration = "45s"

  triggers = {
    cluster_name             = var.cluster_name
    cluster_endpoint         = data.aws_eks_cluster.this.endpoint
    cluster_admin_principals = join(",", sort(var.cluster_admin_principal_arns))
  }
}

module "addons" {
  source = "../modules/platform-addons"

  kubernetes_version                    = var.kubernetes_version
  ward_applications                     = var.ward_applications
  expose_hubble_ui                      = var.expose_hubble_ui
  hubble_ui_host                        = var.hubble_ui_host
  hubble_ui_ingress_class_name          = var.hubble_ui_ingress_class_name
  observability_ingress_whitelist_cidrs = var.observability_ingress_whitelist_cidrs
  hubble_ui_ingress_annotations         = var.hubble_ui_ingress_annotations

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
