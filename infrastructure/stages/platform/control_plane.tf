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
  backend_database_url      = "postgresql://${var.postgresql_username}:${random_password.postgresql_password.result}@${module.postgresql.address}:${module.postgresql.port}/${var.postgresql_database_name}?sslmode=require"
  public_app_url            = local.control_plane_public_url
  terraform_variable_set    = var.environment
  session_cookie_secure     = var.control_plane_session_cookie_secure
  session_ttl_seconds       = var.control_plane_session_ttl_seconds
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

  keycloak_name                    = var.keycloak_name
  keycloak_image                   = var.keycloak_image
  keycloak_image_pull_policy       = var.keycloak_image_pull_policy
  keycloak_realm                   = var.keycloak_realm
  keycloak_client_id               = var.keycloak_client_id
  keycloak_client_secret           = var.keycloak_client_secret
  keycloak_admin_password          = random_password.keycloak_admin_password.result
  keycloak_database_host           = module.postgresql.address
  keycloak_database_port           = module.postgresql.port
  keycloak_database_name           = var.keycloak_database_name
  keycloak_database_username       = var.keycloak_database_username
  keycloak_database_password       = random_password.keycloak_database_password.result
  keycloak_database_admin_database = var.postgresql_database_name
  keycloak_database_admin_username = var.postgresql_username
  keycloak_database_admin_password = random_password.postgresql_password.result

  depends_on = [
    module.addons,
    kubernetes_namespace_v1.control_plane,
    module.postgresql,
  ]
}
