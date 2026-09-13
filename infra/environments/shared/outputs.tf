output "platform_nameservers" {
  description = "GCP nameservers for platform.sparc.build — give to the registrar to delegate."
  value       = google_dns_managed_zone.platform.name_servers
}

output "locus_nameservers" {
  description = "GCP nameservers for locus.sparc.build — give to the registrar to delegate (zone is parked for now)."
  value       = google_dns_managed_zone.locus.name_servers
}

output "platform_zone_name" {
  description = "Cloud DNS managed zone name for platform.sparc.build."
  value       = google_dns_managed_zone.platform.name
}

output "locus_zone_name" {
  description = "Cloud DNS managed zone name for locus.sparc.build."
  value       = google_dns_managed_zone.locus.name
}
