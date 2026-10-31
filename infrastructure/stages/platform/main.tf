locals {
  control_plane_public_gateway_enabled = var.enable_control_plane_public_gateway
  control_plane_public_url             = local.control_plane_public_gateway_enabled ? "https://${var.control_plane_public_hostname}" : var.control_plane_public_app_url
  control_plane_gateway_name           = "${var.project_name}-frontend"
  control_plane_gateway_service_name   = "cilium-gateway-${local.control_plane_gateway_name}"
  # A directory change (e.g. staging -> production) must change issuerRef too,
  # so an existing staging certificate is reissued instead of kept until expiry.
  control_plane_acme_issuer_name = "${local.control_plane_gateway_name}-acme-${substr(sha256(var.control_plane_acme_server), 0, 8)}"
  applications_gateway_name      = var.shared_applications_gateway_name
  applications_gateway_namespace = var.shared_applications_gateway_namespace
}
