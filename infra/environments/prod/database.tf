# Cloud SQL — bumping `tier` here is an online machine-type change (~60 s of
# paused queries, no data loss). For read traffic, add a sibling module call
# with `master_instance_name = module.database.instance_name`. See
# infra/README.md "Scaling".
module "database" {
  source = "../../modules/cloud-sql"

  project             = var.project
  region              = var.region
  name                = "platform-${local.env}"
  tier                = "db-custom-2-7680"
  disk_size           = 20
  availability_type   = "REGIONAL"
  backup_enabled      = true
  deletion_protection = true

  depends_on = [google_project_service.apis]
}

# Shared HMAC secret used to authenticate webhook calls from the auth app
# (Better Auth) to the platform-api. Value is set out-of-band via
# `gcloud secrets versions add auth-webhook-secret --data-file=-` so it never
# appears in Terraform state.
resource "google_secret_manager_secret" "auth_webhook_secret" {
  secret_id = "auth-webhook-secret"
  project   = var.project

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# See dev/database.tf for rationale on per-secret bindings.

resource "google_secret_manager_secret_iam_member" "db_url_platform_api" {
  project   = var.project
  secret_id = module.database.db_url_secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_platform_api.email}"
}

resource "google_secret_manager_secret_iam_member" "auth_webhook_secret_platform_api" {
  project   = var.project
  secret_id = google_secret_manager_secret.auth_webhook_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_platform_api.email}"
}
