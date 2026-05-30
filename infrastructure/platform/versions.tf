terraform {
  required_version = ">= 1.7.0"

  backend "s3" {}

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "5.100.0"
    }
    helm = {
      source  = "hashicorp/helm"
      version = "2.17.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "2.37.1"
    }
    random = {
      source  = "hashicorp/random"
      version = "3.7.2"
    }
    time = {
      source  = "hashicorp/time"
      version = "0.13.1"
    }
  }
}
