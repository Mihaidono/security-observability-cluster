resource "kubernetes_namespace" "wards" {
  for_each = local.analysis_subjects

  metadata {
    name = each.key
    labels = merge({
      "pod-security.kubernetes.io/enforce"         = "restricted"
      "pod-security.kubernetes.io/enforce-version" = local.kubernetes_psa_version
      "analysis-tier"                              = each.value.tier
    }, each.value.labels)
    annotations = merge({
      "isolens.io/description" = each.value.description
    }, each.value.annotations)
  }
}

resource "kubernetes_config_map" "ward_metadata" {
  for_each = local.analysis_subjects

  metadata {
    name      = "ward-metadata"
    namespace = kubernetes_namespace.wards[each.key].metadata[0].name
  }

  data = {
    tier        = each.value.tier
    description = each.value.description
  }
}

resource "kubernetes_resource_quota" "ward_quota" {
  for_each = local.analysis_subjects

  metadata {
    name      = "ward-quota"
    namespace = kubernetes_namespace.wards[each.key].metadata[0].name
  }

  spec {
    hard = {
      pods              = each.value.resource_quota.pods
      "requests.cpu"    = each.value.resource_quota.requests_cpu
      "requests.memory" = each.value.resource_quota.requests_memory
      "limits.cpu"      = each.value.resource_quota.limits_cpu
      "limits.memory"   = each.value.resource_quota.limits_memory
    }
  }
}

resource "kubernetes_limit_range" "ward_defaults" {
  for_each = local.analysis_subjects

  metadata {
    name      = "ward-defaults"
    namespace = kubernetes_namespace.wards[each.key].metadata[0].name
  }

  spec {
    limit {
      type = "Container"

      default = {
        cpu    = "500m"
        memory = "512Mi"
      }

      default_request = {
        cpu    = "250m"
        memory = "256Mi"
      }
    }
  }
}

resource "kubernetes_network_policy" "default_deny" {
  for_each = kubernetes_namespace.wards

  metadata {
    name      = "default-deny"
    namespace = each.value.metadata[0].name
  }

  spec {
    pod_selector {} # Matches all pods in the namespace
    policy_types = ["Ingress", "Egress"]
  }
}

resource "kubernetes_network_policy" "allow_dns" {
  for_each = kubernetes_namespace.wards

  metadata {
    name      = "allow-dns"
    namespace = each.value.metadata[0].name
  }

  spec {
    pod_selector {}
    policy_types = ["Egress"]

    egress {
      to {
        namespace_selector {
          match_labels = {
            "kubernetes.io/metadata.name" = "kube-system"
          }
        }
        pod_selector {
          match_labels = {
            "k8s-app" = "kube-dns"
          }
        }
      }

      ports {
        port     = 53
        protocol = "UDP"
      }

      ports {
        port     = 53
        protocol = "TCP"
      }
    }
  }
}
