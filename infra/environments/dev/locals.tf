locals {
  env      = "dev"
  registry = module.registry.registry_path

  # Public hostnames per service.
  api_host = "api.${local.env}.${var.domain}"
  # Mail-from subdomain. Verified in Resend; transactional sender lives here so
  # the api hostname keeps clean DNS for HTTP-only use.
  mail_host = "mail.${local.env}.${var.domain}"

  # The api under the domain this estate is moving to. Routed as well as
  # resolved, which is the failure this already had: every os.build hostname fell
  # through to the default backend, so mcp.<env>.platform.os.build answered from
  # the platform api and its /.well-known/oauth-protected-resource was a 404.
  #
  # The `mcp` names have no local: apps/api serves /mcp on the api hostname, and
  # the wildcard covers them without either being listed.
  api_host_next = "api.${local.env}.${var.additional_domain}"

  # buildOS ID's hostnames, which this estate consumes rather than owns. Derived
  # from one domain the same way the hosts above are, so an environment is one
  # variable rather than a list of URLs somebody keeps in step by hand. prod
  # sits at that zone's apex, non-prod under its own label.
  identity_base = local.env == "prod" ? var.identity_domain : "${local.env}.${var.identity_domain}"

  # Hydra. The issuer whose signature this API verifies, and the one an MCP
  # client is sent to.
  oauth_host = "oauth.${local.identity_base}"
}
