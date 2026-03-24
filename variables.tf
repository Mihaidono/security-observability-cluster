variable "region" { default = "us-east-1" }

variable "analysis_subjects" {
  type = map(object({
    tier        = string
    description = string
  }))
}