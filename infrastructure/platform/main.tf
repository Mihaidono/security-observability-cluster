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

  kubernetes_version   = var.kubernetes_version
  enable_ingress_nginx = var.enable_ingress_nginx

  depends_on = [time_sleep.cluster_access_ready]
}

module "subjects" {
  source = "../modules/ward-subjects"

  analysis_subjects  = var.analysis_subjects
  kubernetes_version = var.kubernetes_version

  depends_on = [time_sleep.cluster_access_ready]
}

module "control_plane" {
  source = "../modules/control-plane"

  namespace          = var.control_plane_namespace
  kubernetes_version = var.kubernetes_version
  labels             = var.control_plane_namespace_labels
  annotations        = var.control_plane_namespace_annotations

  depends_on = [time_sleep.cluster_access_ready]
}

module "postgresql" {
  source = "../modules/platform-postgresql"

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

resource "time_sleep" "platform_services_ready" {
  create_duration = "30s"

  triggers = {
    cilium_release          = module.addons.monitoring_release_name
    kyverno_namespace       = module.addons.kyverno_namespace
    control_plane           = module.control_plane.namespace
    postgresql_service_fqdn = module.postgresql.service_fqdn
    subject_count           = tostring(length(var.analysis_subjects))
  }

  depends_on = [
    module.addons,
    module.subjects,
    module.control_plane,
    module.postgresql,
  ]
}

module "policy_manifests" {
  source = "../modules/policies-stack"

  analysis_subjects = var.analysis_subjects

  depends_on = [time_sleep.platform_services_ready]
}
