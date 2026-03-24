analysis_subjects = {
  "ward-banking-api" = {
    tier        = "production-mirror"
    description = "Analyzing behavioral baseline of the core banking engine."
  },
  "ward-external-proxy" = {
    tier        = "high-risk"
    description = "Watching for data exfiltration patterns on public-facing ingress."
  },
  "ward-legacy-service" = {
    tier        = "isolated"
    description = "Monitoring a legacy Java app for unexpected process spawning."
  }
}