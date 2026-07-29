locals {
  control_plane_public_gateway_enabled = var.enable_control_plane_public_gateway
  control_plane_public_url             = local.control_plane_public_gateway_enabled ? "https://${var.control_plane_public_hostname}" : var.control_plane_public_app_url
  control_plane_gateway_name           = "${var.project_name}-frontend"
  control_plane_gateway_service_name   = "cilium-gateway-${local.control_plane_gateway_name}"
  applications_gateway_name            = var.shared_applications_gateway_name
  applications_gateway_namespace       = var.shared_applications_gateway_namespace
}
