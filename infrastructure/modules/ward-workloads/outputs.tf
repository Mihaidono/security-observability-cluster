output "ward_service_endpoints" {
  description = "Cluster-local DNS names for services created from ward applications."
  value = {
    for name, app in local.ward_applications :
    name => app.service.enabled ? "${app.service.name}.${app.namespace}.svc.cluster.local:${app.service.port}" : null
  }
}

output "ward_kubectl_commands" {
  description = "Useful kubectl commands for interacting with ward application deployments."
  value = {
    for name, app in local.ward_applications :
    name => {
      pods       = "kubectl get pods -n ${app.namespace} -l isolens.io/application=${app.name}"
      deployment = "kubectl describe deployment -n ${app.namespace} ${app.name}"
      service    = app.service.enabled ? "kubectl get svc -n ${app.namespace} ${app.service.name}" : "service disabled"
    }
  }
}

output "ward_ingress_hosts" {
  description = "Hosts configured for ward application ingress resources."
  value = {
    for name, app in local.applications_with_ingress :
    name => app.ingress.host
  }
}
