output "kyverno_cluster_policies" {
  description = "Kyverno ClusterPolicy objects managed by the policies module."
  value = sort([
    for policy in values(local.enabled_kyverno_cluster_policies) :
    try(policy.manifest.metadata.name, policy.id)
  ])
}

output "tetragon_policy_namespaces" {
  description = "Namespaces that receive Tetragon tracing policies."
  value = sort(tolist(toset(compact([
    for instance in values(local.tetragon_tracing_policy_instances) :
    instance.namespace
  ]))))
}
