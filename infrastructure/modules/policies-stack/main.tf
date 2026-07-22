locals {
  enabled_kyverno_cluster_policies = {
    for policy in var.kyverno_cluster_policies : policy.id => merge(policy, {
      manifest = merge(policy.manifest, {
        metadata = merge(try(policy.manifest.metadata, {}), {
          name = try(policy.manifest.metadata.name, policy.id)
        })
      })
    })
    if try(policy.enabled, true)
  }

  tetragon_tracing_policy_instances = {
    for instance in flatten([
      for policy in var.tetragon_tracing_policies : (
        !try(policy.enabled, true) ? [] :
        try(policy.scope, "all-wards") == "cluster" ? [
          {
            key = policy.id
            manifest = merge(policy.manifest, {
              metadata = merge(try(policy.manifest.metadata, {}), {
                name = try(policy.manifest.metadata.name, policy.id)
              })
            })
            namespace = null
          }
        ] :
        try(policy.scope, "all-wards") == "namespace" && trimspace(try(policy.namespace, "")) != "" ? [
          {
            key = "${policy.id}::${trimspace(policy.namespace)}"
            manifest = merge(policy.manifest, {
              metadata = merge(try(policy.manifest.metadata, {}), {
                name      = try(policy.manifest.metadata.name, policy.id)
                namespace = trimspace(policy.namespace)
              })
            })
            namespace = trimspace(policy.namespace)
          }
          ] : [
          for namespace in sort(keys(var.analysis_subjects)) : {
            key = "${policy.id}::${namespace}"
            manifest = merge(policy.manifest, {
              metadata = merge(try(policy.manifest.metadata, {}), {
                name      = try(policy.manifest.metadata.name, policy.id)
                namespace = namespace
              })
            })
            namespace = namespace
          }
        ]
      )
    ]) : instance.key => instance
  }
}

resource "kubernetes_manifest" "kyverno_cluster_policy" {
  for_each = local.enabled_kyverno_cluster_policies

  manifest = each.value.manifest
}

resource "kubernetes_manifest" "tetragon_tracing_policy" {
  for_each = local.tetragon_tracing_policy_instances

  manifest = each.value.manifest
}
