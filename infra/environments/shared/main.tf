terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  backend "gcs" {
    bucket = "platform-shared-495022-tfstate"
    prefix = "infra"
  }
}

provider "google" {
  project = var.project
  region  = var.region
}