module "load_balancer" {
  source = "../../modules/load-balancer"

  project = var.project
  region  = var.region
  name    = "platform-${local.env}"

  services = {
    platform-api = {
      cloud_run_name = module.platform_api.name
      domains        = [local.api_host, local.api_host_next]
    }
    # No `mcp` backend: apps/api serves /mcp, so the mcp names fall through to
    # the default backend.
  }

  # Two wildcards, validated by a CNAME rather than by serving the name, so a
  # hostname can be added or withdrawn without any certificate changing. The
  # sparc.build entry goes when those names are retired.
  wildcard_domains = [
    "${local.env}.${var.additional_domain}",
    "${local.env}.${var.domain}",
  ]

  # Both certificates are ACTIVE and every map entry exists, which is the only
  # precondition: attaching a map with anything unprovisioned takes TLS down for
  # every name on the proxy.
  attach_certificate_map = true

  # The rollback, reached by setting the flag above back to false, so it names
  # what the url map routes and nothing more. `auth` is absent: nothing serves
  # it and its record goes with this.
  cert_domains = [local.api_host, local.api_host_next]

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
