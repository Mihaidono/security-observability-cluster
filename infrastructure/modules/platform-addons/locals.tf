locals {
  kubernetes_psa_version = var.kubernetes_version == "latest" ? "latest" : (
    startswith(var.kubernetes_version, "v") ? var.kubernetes_version : "v${var.kubernetes_version}"
  )

  hubble_ui_ingress_enabled             = var.expose_hubble_ui && trimspace(var.hubble_ui_host) != ""
  observability_identity_enabled        = var.enable_observability_identity && trimspace(var.keycloak_host) != "" && trimspace(var.oauth2_proxy_host) != ""
  hubble_ui_identity_protection_enabled = local.hubble_ui_ingress_enabled && local.observability_identity_enabled && var.protect_hubble_ui_with_identity
  identity_namespace                    = "identity-platform"
  observability_ingress_class_name      = var.hubble_ui_ingress_class_name
  keycloak_service_name                 = "keycloak"
  oauth2_proxy_service_name             = "oauth2-proxy"
  keycloak_internal_base_url            = "http://${local.keycloak_service_name}.${local.identity_namespace}.svc.cluster.local"
  oauth2_proxy_internal_auth_url        = "http://${local.oauth2_proxy_service_name}.${local.identity_namespace}.svc.cluster.local/oauth2/auth"
  oauth2_proxy_signin_url               = "http://${var.oauth2_proxy_host}/oauth2/start?rd=$scheme://$best_http_host$escaped_request_uri"
  oauth2_proxy_redirect_url             = "http://${var.oauth2_proxy_host}/oauth2/callback"
  keycloak_external_realm_base_url      = "http://${var.keycloak_host}/realms/${var.observability_realm_name}"
  keycloak_internal_realm_base_url      = "${local.keycloak_internal_base_url}/realms/${var.observability_realm_name}"
  observability_ingress_annotations = length(var.observability_ingress_whitelist_cidrs) > 0 ? {
    "nginx.ingress.kubernetes.io/whitelist-source-range" = join(",", var.observability_ingress_whitelist_cidrs)
  } : {}

  ingress_apps = [
    for app in var.ward_applications : app
    if try(app.ingress.enabled, false) && try(app.service.enabled, true)
  ]

  ingress_class_names = toset([
    for app in local.ingress_apps : app.ingress.class_name
    if try(app.ingress.class_name, null) != null
  ])

  platform_ingress_class_names = toset(compact([
    local.hubble_ui_ingress_enabled ? local.observability_ingress_class_name : null,
    local.observability_identity_enabled ? local.observability_ingress_class_name : null,
  ]))

  requires_ingress_nginx = contains(setunion(local.ingress_class_names, local.platform_ingress_class_names), "nginx")

  hubble_ui_ingress_annotations = merge(
    local.observability_ingress_annotations,
    local.hubble_ui_identity_protection_enabled ? {
      "nginx.ingress.kubernetes.io/auth-url"              = local.oauth2_proxy_internal_auth_url
      "nginx.ingress.kubernetes.io/auth-signin"           = local.oauth2_proxy_signin_url
      "nginx.ingress.kubernetes.io/auth-response-headers" = "X-Auth-Request-User,X-Auth-Request-Email,X-Auth-Request-Groups,Authorization"
    } : {},
    var.hubble_ui_ingress_annotations,
  )

  keycloak_ingress_annotations = merge(
    local.observability_ingress_annotations,
    {
      "nginx.ingress.kubernetes.io/ssl-redirect" = "false"
    },
  )

  oauth2_proxy_ingress_annotations = merge(
    local.observability_ingress_annotations,
    {
      "nginx.ingress.kubernetes.io/ssl-redirect" = "false"
    },
  )

  observability_realm_configuration = {
    realm       = var.observability_realm_name
    enabled     = true
    displayName = "Isolens Observability"
    groups      = [{ name = trim(var.observability_allowed_group, "/") }]
    clientScopes = [
      {
        name       = "groups"
        protocol   = "openid-connect"
        attributes = { "include.in.token.scope" = "true", "display.on.consent.screen" = "false" }
        protocolMappers = [
          {
            name            = "groups"
            protocol        = "openid-connect"
            protocolMapper  = "oidc-group-membership-mapper"
            consentRequired = false
            config = {
              "full.path"            = "true"
              "id.token.claim"       = "true"
              "access.token.claim"   = "true"
              "userinfo.token.claim" = "true"
              "claim.name"           = "groups"
            }
          }
        ]
      }
    ]
    clients = [
      {
        clientId                  = local.oauth2_proxy_service_name
        name                      = "Isolens Observability Auth"
        protocol                  = "openid-connect"
        enabled                   = true
        publicClient              = false
        secret                    = "$(env:OAUTH2_PROXY_CLIENT_SECRET)"
        standardFlowEnabled       = true
        implicitFlowEnabled       = false
        directAccessGrantsEnabled = false
        serviceAccountsEnabled    = false
        fullScopeAllowed          = true
        redirectUris              = [local.oauth2_proxy_redirect_url]
        webOrigins                = ["http://${var.oauth2_proxy_host}"]
        defaultClientScopes       = ["web-origins", "acr", "profile", "roles", "email", "groups"]
        optionalClientScopes      = ["address", "phone", "offline_access", "microprofile-jwt"]
      }
    ]
    users = [
      {
        username      = var.observability_demo_username
        enabled       = true
        emailVerified = true
        email         = var.observability_demo_email
        groups        = [var.observability_allowed_group]
        credentials = [
          {
            type      = "password"
            value     = "$(env:OBSERVABILITY_DEMO_USER_PASSWORD)"
            temporary = false
          }
        ]
      }
    ]
  }
}
