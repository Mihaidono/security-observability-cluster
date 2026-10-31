# Plans only: mocks keep these checks independent of AWS, live CRDs and ACME.
mock_provider "aws" {
  mock_data "aws_iam_policy_document" {
    defaults = {
      json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}"
    }
  }
  mock_data "aws_eks_cluster" {
    defaults = {
      endpoint              = "https://eks.example.invalid"
      certificate_authority = [{ data = "dGVzdC1jYQ==" }]
      identity              = [{ oidc = [{ issuer = "https://oidc.example.invalid/id/test" }] }]
      vpc_config            = [{ vpc_id = "vpc-test" }]
    }
  }
}

mock_provider "kubernetes" {
  mock_data "kubernetes_service_v1" {
    defaults = {
      status = [{ load_balancer = [{ ingress = [{ hostname = "frontend.example.elb.amazonaws.com" }] }] }]
    }
  }
}

mock_provider "helm" {}
mock_provider "random" {}
mock_provider "time" {}

variables {
  cert_manager_version                 = "v1.21.3"
  enable_cert_manager                  = true
  enable_control_plane_public_gateway  = true
  control_plane_public_hostname        = "isolens.endavahub.net"
  control_plane_public_tls_secret_name = "isolens-frontend-tls"
  control_plane_route53_zone_id        = ""
}

run "managed_tls_preserves_frontend_isolation" {
  command = plan

  variables {
    control_plane_manage_tls = true
  }

  assert {
    condition = (
      kubernetes_manifest.control_plane_gateway[0].manifest.spec.listeners[0].port == 443 &&
      kubernetes_manifest.control_plane_gateway[0].manifest.spec.listeners[1].port == 80 &&
      kubernetes_manifest.control_plane_gateway[0].manifest.spec.listeners[1].allowedRoutes.namespaces.from == "Same" &&
      kubernetes_manifest.control_plane_frontend_route[0].manifest.spec.parentRefs[0].sectionName == "https"
    )
    error_message = "The frontend route must attach only to HTTPS; the HTTP solver listener must stay in the control-plane namespace."
  }

  assert {
    condition = (
      kubernetes_manifest.control_plane_acme_issuer[0].manifest.spec.acme.solvers[0].http01.gatewayHTTPRoute.parentRefs[0].sectionName == "acme-http" &&
      kubernetes_manifest.control_plane_acme_issuer[0].manifest.spec.acme.solvers[0].http01.gatewayHTTPRoute.parentRefs[0].name == kubernetes_manifest.control_plane_gateway[0].manifest.metadata.name &&
      kubernetes_manifest.control_plane_acme_issuer[0].manifest.spec.acme.solvers[0].http01.gatewayHTTPRoute.serviceType == "ClusterIP" &&
      kubernetes_manifest.control_plane_acme_issuer[0].manifest.spec.acme.solvers[0].selector.dnsNames == [var.control_plane_public_hostname]
    )
    error_message = "ACME must use the dedicated frontend HTTP listener and a private solver service for the exact frontend name."
  }

  assert {
    condition = (
      kubernetes_manifest.control_plane_certificate[0].manifest.spec.secretName == kubernetes_manifest.control_plane_gateway[0].manifest.spec.listeners[0].tls.certificateRefs[0].name &&
      kubernetes_manifest.control_plane_certificate[0].manifest.spec.dnsNames == [var.control_plane_public_hostname] &&
      kubernetes_manifest.control_plane_certificate[0].manifest.spec.issuerRef.kind == "Issuer" &&
      kubernetes_manifest.control_plane_certificate[0].manifest.spec.issuerRef.name == kubernetes_manifest.control_plane_acme_issuer[0].manifest.metadata.name &&
      kubernetes_manifest.control_plane_certificate[0].manifest.metadata.namespace == kubernetes_manifest.control_plane_gateway[0].manifest.metadata.namespace &&
      kubernetes_manifest.control_plane_certificate[0].manifest.spec.privateKey.rotationPolicy == "Always" &&
      kubernetes_manifest.control_plane_certificate[0].manifest.spec.renewBeforePercentage == 33
    )
    error_message = "The namespaced certificate must populate the Gateway TLS secret, renew before expiry and rotate its private key."
  }

  assert {
    condition     = length(aws_route53_record.control_plane_frontend) == 0
    error_message = "Manual cross-account DNS must not create Route53 records in the cluster account."
  }
}

run "staging_uses_a_separate_issuer_and_account" {
  command = plan

  variables {
    control_plane_manage_tls  = true
    control_plane_acme_server = "https://acme-staging-v02.api.letsencrypt.org/directory"
  }

  assert {
    condition = (
      kubernetes_manifest.control_plane_certificate[0].manifest.spec.issuerRef.name != run.managed_tls_preserves_frontend_isolation.control_plane_certificate_issuer_name &&
      kubernetes_manifest.control_plane_acme_issuer[0].manifest.spec.acme.privateKeySecretRef.name != "${run.managed_tls_preserves_frontend_isolation.control_plane_certificate_issuer_name}-account"
    )
    error_message = "Staging and production must use separate issuer names and account keys so directory changes trigger certificate reissuance."
  }
}

run "external_tls_does_not_open_http" {
  command = plan

  variables {
    control_plane_manage_tls = false
    enable_cert_manager      = false
  }

  assert {
    condition = (
      length(kubernetes_manifest.control_plane_gateway[0].manifest.spec.listeners) == 1 &&
      kubernetes_manifest.control_plane_gateway[0].manifest.spec.listeners[0].port == 443 &&
      length(kubernetes_manifest.control_plane_acme_issuer) == 0 &&
      length(kubernetes_manifest.control_plane_certificate) == 0
    )
    error_message = "Externally managed TLS must not create ACME resources or an HTTP listener."
  }
}

run "managed_tls_requires_cert_manager" {
  command = plan

  variables {
    control_plane_manage_tls = true
    enable_cert_manager      = false
  }

  expect_failures = [var.control_plane_manage_tls]
}
