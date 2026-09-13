locals {
  env      = "prod"
  registry = module.registry.registry_path

  # This environment is born on `additional_domain` and takes no name under the
  # domain being retired: a managed certificate cannot be replaced in place, so
  # a name added here is a certificate rotation to remove later. prod sits at
  # that zone's apex, which is why there is no env label.
  api_host = "api.${var.additional_domain}"
  # apps/api serves /mcp, so this is a certificate SAN rather than a backend and
  # falls through to the default service. The shared zone publishes the name for
  # every environment, and dropping a SAN rotates the certificate.
  mcp_host = "mcp.${var.additional_domain}"

  # buildOS ID's hostnames, which this estate consumes rather than owns. Derived
  # from one domain the same way the hosts above are, so an environment is one
  # variable rather than a list of URLs somebody keeps in step by hand. prod
  # sits at that zone's apex, which is why there is no env label here.
  identity_base = var.identity_domain

  # Hydra. The issuer whose signature this API verifies, and the one an MCP
  # client is sent to.
  oauth_host = "oauth.${local.identity_base}"
}
