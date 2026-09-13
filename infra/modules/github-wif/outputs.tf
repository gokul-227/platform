output "workload_identity_provider" {
  value = google_iam_workload_identity_pool_provider.github.name
}

output "deploy_service_account" {
  value = google_service_account.deploy.email
}

output "plan_workload_identity_provider" {
  value = try(google_iam_workload_identity_pool_provider.github_plan[0].name, null)
}

output "plan_service_account" {
  value = try(google_service_account.plan[0].email, null)
}

# The GitHub Actions variable the ship-only jobs authenticate as. Empty until
# the environment enables the identity.
output "ship_service_account" {
  description = "Email for the WIF_SERVICE_ACCOUNT_SHIP repository variable."
  value       = var.enable_ship_identity ? google_service_account.ship[0].email : ""
}
