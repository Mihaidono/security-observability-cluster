variable "analysis_subject_names" {
  description = "Set of valid ward namespace names used to guard application placement."
  type        = set(string)
}

variable "ward_applications" {
  description = "Validated ward application definitions from the root module."
  type        = list(any)
}
