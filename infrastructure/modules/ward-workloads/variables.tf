variable "analysis_subject_names" {
  description = "Set of valid ward namespace names used to guard application placement."
  type        = set(string)
}

variable "ward_applications" {
  description = "Validated ward application definitions from the root module."
  type        = any

  validation {
    condition = can([
      for app in var.ward_applications : {
        name      = app.name
        namespace = app.namespace
      }
    ])
    error_message = "ward_applications must be a list of objects that at least define name and namespace."
  }
}
