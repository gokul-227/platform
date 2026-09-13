locals {
  env      = "test"
  registry = module.registry.registry_path

  # Public hostnames per service.
  api_host  = "api.${local.env}.${var.domain}"
  auth_host = "auth.${local.env}.${var.domain}"
  # Mail-from subdomain. Verified in Resend; transactional sender lives here
  # so the apex/auth hostnames keep clean DNS for HTTP-only use.
  mail_host = "mail.${local.env}.${var.domain}"
  # No `mcp_host`: apps/api serves /mcp on the api hostname, so this
  # environment needs no name of its own for it.

  # buildOS ID's hostnames, which this estate consumes rather than owns. Derived
  # from one domain the same way the hosts above are, so an environment is one
  # variable rather than a list of URLs somebody keeps in step by hand. prod
  # sits at that zone's apex, non-prod under its own label.
  identity_base = "${local.env}.${var.identity_domain}"

  # Hydra. The issuer whose signature this API verifies, and the one an MCP
  # client is sent to.
  oauth_host = "oauth.${local.identity_base}"
}
