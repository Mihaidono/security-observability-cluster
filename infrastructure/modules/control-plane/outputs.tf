output "namespace" {
  description = "Namespace reserved for the Isolens backend and frontend workloads."
  value       = kubernetes_namespace_v1.control_plane.metadata[0].name
}
