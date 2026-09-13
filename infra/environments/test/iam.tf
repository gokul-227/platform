module "github_wif" {
  source = "../../modules/github-wif"

  project     = var.project
  github_org  = var.github_org
  github_repo = var.github_repo

  # This environment is deployed by pushing a release tag, so the token the
  # deploy presents carries a tag ref rather than refs/heads/main. dev takes the
  # default and stays branch-only.
  allowed_ref_prefixes = ["refs/tags/v"]

  depends_on = [google_project_service.apis]
}

# See dev/iam.tf for the rationale on splitting Cloud Run SAs and moving
# Secret Manager access from project-wide to per-secret bindings.
locals {
  cloud_run_common_roles = [
    "roles/cloudsql.client",
    "roles/artifactregistry.reader",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
  ]
}

resource "google_service_account" "cloud_run_platform_api" {
  account_id   = "cloud-run-platform-api"
  display_name = "Cloud Run runtime (platform-api)"
  project      = var.project

  depends_on = [google_project_service.apis]
}

resource "google_project_iam_member" "cloud_run_platform_api_roles" {
  for_each = toset(local.cloud_run_common_roles)

  project = var.project
  role    = each.value
  member  = "serviceAccount:${google_service_account.cloud_run_platform_api.email}"
}

output "cloud_run_platform_api_service_account" {
  value = google_service_account.cloud_run_platform_api.email
}

output "workload_identity_provider" {
  value = module.github_wif.workload_identity_provider
}

output "deploy_service_account" {
  value = module.github_wif.deploy_service_account
}
