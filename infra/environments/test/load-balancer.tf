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

  # Two wildcards, validated by a CNAME rather than by serving the name. This is
  # also how the certificate below gets replaced rather than repaired: it is
  # stuck at PROVISIONING because `test.platform.sparc.build` reported
  # FAILED_NOT_VISIBLE, and it expires 2026-08-29.
  #
  # `attach_certificate_map` stays false until both certificates are ACTIVE,
  # which needs their authorization CNAMEs in the shared stack first. Attaching a
  # map with anything unprovisioned takes TLS down for every name on the proxy.
  wildcard_domains = [
    "${local.env}.${var.additional_domain}",
    "${local.env}.${var.domain}",
  ]

  # Pinned to the live certificate's SAN set, which still carries the retired
  # `auth` name and the removed platform host. Dropping either rotates the
  # certificate and blacks out api over TLS for the reprovision. Both come out
  # once the map above is serving, when a SAN set means nothing.
  cert_domains = [local.api_host, local.auth_host, "${local.env}.${var.domain}"]

  # The names this estate is moving to, on a second certificate so the one
  # serving today does not rotate: a name is added beside the live certificate,
  # never inside it.
  additional_cert_domains = [
    "api.${local.env}.${var.additional_domain}",
    "mcp.${local.env}.${var.additional_domain}",
  ]

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
