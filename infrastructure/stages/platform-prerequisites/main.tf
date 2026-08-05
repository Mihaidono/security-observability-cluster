data "http" "gateway_api_standard" {
  url = "https://github.com/kubernetes-sigs/gateway-api/releases/download/v${var.gateway_api_crds_version}/standard-install.yaml"
}

resource "time_sleep" "cluster_access_ready" {
  create_duration = "45s"

  triggers = {
    cluster_name = var.cluster_name
  }
}

locals {
  gateway_api_standard_manifests = {
    for document in split("\n---\n", data.http.gateway_api_standard.response_body) :
    yamldecode(document).metadata.name => yamldecode(document)
    if trimspace(document) != "" && can(yamldecode(document).kind)
  }
}

resource "kubernetes_manifest" "gateway_api_standard" {
  for_each = local.gateway_api_standard_manifests

  manifest = each.value

  depends_on = [time_sleep.cluster_access_ready]
}
