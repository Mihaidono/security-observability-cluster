data "http" "cert_manager_crds" {
  count = var.enable_cert_manager ? 1 : 0

  url = "https://github.com/cert-manager/cert-manager/releases/download/${var.cert_manager_version}/cert-manager.crds.yaml"
}

locals {
  cert_manager_crd_documents = var.enable_cert_manager ? split("\n---\n", data.http.cert_manager_crds[0].response_body) : []
  cert_manager_crd_manifests = {
    for document in local.cert_manager_crd_documents :
    yamldecode(document).metadata.name => yamldecode(document)
    if trimspace(document) != "" && can(yamldecode(document).kind)
  }
}

resource "kubernetes_manifest" "cert_manager_crds" {
  for_each = local.cert_manager_crd_manifests

  manifest = { for key, value in each.value : key => value if key != "status" }

  # Deleting CRDs also deletes their Certificate, Issuer, Order and Challenge
  # objects. A normal platform rollback must retain these API extensions.
  lifecycle {
    prevent_destroy = true
  }

  depends_on = [time_sleep.cluster_access_ready]
}
