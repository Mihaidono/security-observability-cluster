module "policy_manifests" {
  source = "../modules/policies-stack"

  analysis_subjects = var.analysis_subjects
}
