locals {
  analysis_subjects = {
    for name, subject in var.analysis_subjects : name => merge(subject, {
      labels      = try(subject.labels, {})
      annotations = try(subject.annotations, {})
    })
  }
}
