# Install Cilium in ENI mode (best for EKS)
resource "helm_release" "cilium" {
  name       = "cilium"
  repository = "https://helm.cilium.io/"
  chart      = "cilium"
  namespace  = "kube-system"
  version    = "1.19.2"

  set { name = "eni.enabled"; value = "true" }
  set { name = "ipam.mode"; value = "eni" }
  set { name = "egressGateway.enabled"; value = "true" }
  set { name = "hubble.enabled"; value = "true" }
  set { name = "hubble.ui.enabled"; value = "true" }
}

# Install Tetragon for Real-time Forensic Process Logging
resource "helm_release" "tetragon" {
  name       = "tetragon"
  repository = "https://helm.cilium.io/"
  chart      = "tetragon"
  namespace  = "kube-system"
  version    = "0.12.0"
  
  depends_on = [helm_release.cilium]
}

# Monitoring Zone (Prometheus/Grafana/Loki)
resource "kubernetes_namespace" "monitoring" {
  metadata { name = "monitoring-zone" }
}

resource "helm_release" "lgtm_stack" {
  name       = "lgtm"
  repository = "https://grafana.github.io/helm-charts"
  chart      = "grafana-agent" # Or the full kube-prometheus-stack
  namespace  = kubernetes_namespace.monitoring.metadata[0].name
}