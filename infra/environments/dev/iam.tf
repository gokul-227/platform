module "github_wif" {
  source = "../../modules/github-wif"

  project     = var.project
  github_org  = var.github_org
  github_repo = var.github_repo

  # Read-only plan-on-PR identity. Enabled for dev first.
  enable_plan_identity = true

  # Ship-only identity for the every-merge path, beside the broad deploy account
  # rather than replacing it: the workflows keep authenticating as the old one
  # until the repository variable below is set, so enabling this changes nothing
  # until somebody chooses to switch.
  #
  # It can roll these three services, run their migration job, push an image,
  # and read the one secret that job needs. It holds no IAM role that can grant
  # another, which is the property the broad account cannot have while it is
  # also the account that applies terraform.
  enable_ship_identity = true

  runtime_service_accounts = [
    google_service_account.cloud_run_platform_api.email,
  ]

  artifact_registry_repository = module.registry.repository_id
  region                       = var.region

  # The migration job's DSN. Named singly on purpose: this is the whole of what
  # the automatic path may read, against secretmanager.admin over every secret
  # in the project today.
  ship_readable_secrets = [module.database.db_url_secret_id]

  depends_on = [google_project_service.apis]
}

# Common project-wide roles for both Cloud Run runtime SAs. Secret Manager
# access is intentionally NOT here — it's granted per-secret next to each
# secret declaration (see database.tf and service.auth.tf), so a compromised
# auth process can't read platform-api's secrets (and vice versa).
locals {
  cloud_run_common_roles = [
    "roles/cloudsql.client",
    "roles/artifactregistry.reader",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
  ]
}

# ── apps/api runtime SA ──────────────────────────────────────────────────────
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

# Vertex AI (Gemini) for the thread-run worker (LLM_ENABLED) and the document
# index's embeddings, answers and figure captions. platform-api only: the other
# runtimes never call models.
resource "google_project_iam_member" "cloud_run_platform_api_vertex" {
  project = var.project
  role    = "roles/aiplatform.user"
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

output "plan_workload_identity_provider" {
  value = module.github_wif.plan_workload_identity_provider
}

output "plan_service_account" {
  value = module.github_wif.plan_service_account
}
