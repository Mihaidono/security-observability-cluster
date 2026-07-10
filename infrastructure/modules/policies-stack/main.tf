resource "helm_release" "policy_manifests" {
  name             = "isolens-policies"
  chart            = "${path.root}/../charts/isolens-policies"
  namespace        = "kube-system"
  create_namespace = false
  wait             = true
  timeout          = 600
  atomic           = true
  cleanup_on_fail  = true

  values = [
    yamlencode({
      analysisSubjects          = sort(keys(var.analysis_subjects))
      suspiciousNetworkBinaries = local.suspicious_network_binaries
      suspiciousShellBinaries   = local.suspicious_shell_binaries
    })
  ]
}
