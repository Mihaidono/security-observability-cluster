# Loop through the list of analysis subjects
resource "kubernetes_namespace" "wards" {
  for_each = var.analysis_subjects

  metadata {
    name = each.key
    labels = {
      # 2026 Standard: Enforce restricted security profile
      "pod-security.kubernetes.io/enforce"         = "restricted"
      "pod-security.kubernetes.io/enforce-version" = "v1.35"
      "analysis-tier"                              = each.value.tier
    }
  }
}

# Apply a Default Deny Network Policy to every ward
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