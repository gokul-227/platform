output "db_connection_name" {
  description = "Cloud SQL connection name (project:region:instance) — used in DATABASE_URL via the Cloud SQL Auth Proxy."
  value       = module.database.connection_name
}

output "db_instance_name" {
  description = "Cloud SQL instance name."
  value       = module.database.instance_name
}

output "db_url_secret_id" {
  description = "Secret Manager secret ID holding the full DATABASE_URL (with password)."
  value       = module.database.db_url_secret_id
}

# Hand to the shared stack, which owns the zones these have to be created in.
# Until they exist the wildcard certificates stay PENDING and the map must not be
# attached.
output "dns_authorization_records" {
  description = "CNAMEs the shared stack must create for this environment's wildcard certificates."
  value       = module.load_balancer.dns_authorization_records
}

# The GitHub Actions repository variable that moves the every-merge path onto the
# minimal identity. Until it is set, those jobs fall back to WIF_SERVICE_ACCOUNT
# and behave exactly as they do today.
output "ship_service_account" {
  description = "Set as the WIF_SERVICE_ACCOUNT_SHIP repository variable."
  value       = module.github_wif.ship_service_account
}
