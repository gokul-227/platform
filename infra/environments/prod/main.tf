terraform {
  required_version = ">= 1.9"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }

  backend "gcs" {
    bucket = "platform-prod-495017-tfstate"
    prefix = "infra"
  }
}

provider "google" {
  project = var.project
  region  = var.region
}
