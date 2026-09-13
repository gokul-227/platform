output "internal_ip" {
  value = google_compute_instance.memgraph.network_interface[0].network_ip
}

output "external_ip" {
  value = try(google_compute_instance.memgraph.network_interface[0].access_config[0].nat_ip, null)
}

output "bolt_uri_internal" {
  value = "bolt://${google_compute_instance.memgraph.network_interface[0].network_ip}:7687"
}

output "bolt_uri_external" {
  value = try(
    "bolt://${google_compute_instance.memgraph.network_interface[0].access_config[0].nat_ip}:7687",
    null
  )
}
