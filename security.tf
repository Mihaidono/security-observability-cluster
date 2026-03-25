resource "kubernetes_namespace" "kyverno" {
  metadata {
    name = "kyverno"
    labels = {
      "pod-security.kubernetes.io/enforce"         = "baseline"
      "pod-security.kubernetes.io/enforce-version" = var.kubernetes_version
      "observability-role"                         = "policy-engine"
    }
  }
}

resource "helm_release" "kyverno" {
  name       = "kyverno"
  repository = "https://kyverno.github.io/kyverno/"
  chart      = "kyverno"
  namespace  = kubernetes_namespace.kyverno.metadata[0].name
  wait       = true

  depends_on = [kubernetes_namespace.kyverno]
}

resource "kubernetes_manifest" "kyverno_require_subject_label" {
  count = var.enable_custom_runtime_policies ? 1 : 0

  manifest = {
    apiVersion = "kyverno.io/v1"
    kind       = "ClusterPolicy"
    metadata = {
      name = "require-ward-subject-label"
    }
    spec = {
      background = true
      rules = [
        {
          name = "pods-in-wards-must-carry-subject-label"
          match = {
            any = [
              {
                resources = {
                  kinds = ["Pod"]
                  namespaceSelector = {
                    matchExpressions = [
                      {
                        key      = "analysis-tier"
                        operator = "Exists"
                      }
                    ]
                  }
                }
              }
            ]
          }
          validate = {
            failureAction = "Enforce"
            message       = "Pods deployed into ward namespaces must declare the kubeguardian.io/subject label."
            pattern = {
              metadata = {
                labels = {
                  "kubeguardian.io/subject" = "?*"
                }
              }
            }
          }
        }
      ]
    }
  }

  depends_on = [helm_release.kyverno]
}

resource "kubernetes_manifest" "kyverno_disallow_latest_tag" {
  count = var.enable_custom_runtime_policies ? 1 : 0

  manifest = {
    apiVersion = "kyverno.io/v1"
    kind       = "ClusterPolicy"
    metadata = {
      name = "disallow-latest-tag-in-wards"
    }
    spec = {
      background = true
      rules = [
        {
          name = "disallow-latest-image-tags"
          match = {
            any = [
              {
                resources = {
                  kinds = ["Pod"]
                  namespaceSelector = {
                    matchExpressions = [
                      {
                        key      = "analysis-tier"
                        operator = "Exists"
                      }
                    ]
                  }
                }
              }
            ]
          }
          validate = {
            failureAction = "Enforce"
            message       = "Ward workloads must pin container images and may not use the latest tag."
            foreach = [
              {
                list = "request.object.spec.containers"
                deny = {
                  conditions = {
                    any = [
                      {
                        key      = "{{ contains(element.image, ':latest') }}"
                        operator = "Equals"
                        value    = true
                      }
                    ]
                  }
                }
              }
            ]
          }
        }
      ]
    }
  }

  depends_on = [helm_release.kyverno]
}

resource "kubernetes_manifest" "tetragon_suspicious_exec" {
  for_each = var.enable_custom_runtime_policies ? local.analysis_subjects : {}

  manifest = {
    apiVersion = "cilium.io/v1alpha1"
    kind       = "TracingPolicyNamespaced"
    metadata = {
      name      = "suspicious-exec"
      namespace = kubernetes_namespace.wards[each.key].metadata[0].name
    }
    spec = {
      kprobes = [
        {
          call    = "sys_execve"
          syscall = true
          selectors = [
            {
              matchBinaries = [
                {
                  operator = "In"
                  values = [
                    "/usr/bin/curl",
                    "/bin/curl",
                    "/usr/bin/wget",
                    "/bin/wget",
                    "/usr/bin/nc",
                    "/bin/nc",
                  ]
                }
              ]
              matchActions = [
                {
                  action = "Post"
                }
              ]
            },
            {
              matchBinaries = [
                {
                  operator = "In"
                  values = [
                    "/usr/bin/bash",
                    "/bin/bash",
                    "/usr/bin/sh",
                    "/bin/sh",
                  ]
                }
              ]
              matchActions = [
                {
                  action = "Post"
                }
              ]
            }
          ]
        }
      ]
    }
  }

  depends_on = [helm_release.tetragon]
}
