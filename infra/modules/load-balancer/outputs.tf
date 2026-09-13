output "ip_address" {
  value = google_compute_global_address.this.address
}

output "domains" {
  value = local.all_domains
}

output "security_policy_id" {
  value = var.enable_cloud_armor ? google_compute_security_policy.this[0].id : null
}
