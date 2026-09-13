module "load_balancer" {
  source = "../../modules/load-balancer"

  project = var.project
  region  = var.region
  name    = "platform-${local.env}"

  services = {
    platform-api = {
      cloud_run_name = module.platform_api.name
      domains        = [local.api_host]
    }
    # No `mcp` backend: apps/api serves /mcp on the api hostname.
  }

  # Both names this environment answers. The certificate is created by the same
  # apply that mints the load balancer's address, so the address has to be in
  # DNS first: a managed certificate created before its A record answers sticks
  # at FAILED_NOT_VISIBLE and cannot be replaced in place. docs/deployment.md
  # has the two-phase first apply.
  cert_domains = [local.api_host, local.mcp_host]

  # One wildcard, validated by a CNAME rather than by serving the name, so every
  # hostname after the first arrives without touching a certificate. prod takes
  # no name under the domain being retired, so there is only one.
  #
  # `attach_certificate_map` stays false until the certificate is ACTIVE, which
  # needs its authorization CNAME in the shared stack: apply here, feed
  # `dns_authorization_records` across, apply shared, then flip the flag.
  wildcard_domains = [var.additional_domain]

  default_service = "platform-api"

  enable_cloud_armor      = true
  rate_limit_threshold    = 300
  rate_limit_interval_sec = 60

  depends_on = [google_project_service.apis]
}

output "load_balancer_ip" {
  value = module.load_balancer.ip_address
}

output "load_balancer_domains" {
  value = module.load_balancer.domains
}

# Hand to the shared stack, which owns the zones these have to be created in.
# Until they exist the wildcard certificates stay PENDING and the map must not be
# attached.
output "dns_authorization_records" {
  description = "CNAMEs the shared stack must create for this environment's wildcard certificates."
  value       = module.load_balancer.dns_authorization_records
}
