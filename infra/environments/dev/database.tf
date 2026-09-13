# Cloud SQL — when this gets sluggish, bump `tier` (e.g. db-g1-small,
# db-custom-1-3840) and `terraform apply`. See infra/README.md "Scaling".
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

# ── auth schema database (was apps/auth, Better Auth) ────────────────────────
# Kept after that app was deleted, on purpose. It holds the only record of who
# signed in through which provider before the Ory cutover, it costs nothing on an
# instance that exists anyway, and dropping a database is the one step here that
# cannot be undone. Take a dump first if it goes.
# Sibling database on the same Cloud SQL instance as `platform`. Mirrors the
# local-dev shape (apps/auth/compose.yaml runs a single Postgres with both
# `auth` and `platform` databases). The platform user owns both; isolation is
# at the database level, not at the user level.
resource "google_sql_database" "auth" {
  name     = "auth"
  instance = module.database.instance_name
  project  = var.project
}

# ── per-secret IAM bindings ──────────────────────────────────────────────────
# Replaces the previous project-wide `roles/secretmanager.secretAccessor`
# grant on the (now retired) single Cloud Run SA. Each runtime SA gets read
# access only to the secrets it actually mounts. `auth-webhook-secret` is the
# only one shared — auth signs the call, platform-api verifies the HMAC.

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
