module "database" {
  source = "../../modules/cloud-sql"

  project             = var.project
  region              = var.region
  name                = "platform-${local.env}"
  tier                = "db-f1-micro"
  backup_enabled      = true
  deletion_protection = false

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

# ── auth schema database (apps/auth, Better Auth) ────────────────────────────
# Sibling database on the same Cloud SQL instance as `platform`. See the dev
# env's database.tf for the rationale.
resource "google_sql_database" "auth" {
  name     = "auth"
  instance = module.database.instance_name
  project  = var.project
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
