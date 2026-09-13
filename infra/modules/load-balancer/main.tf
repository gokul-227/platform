resource "google_compute_global_address" "this" {
  name    = var.name
  project = var.project
}

resource "google_compute_region_network_endpoint_group" "services" {
  for_each = var.services

  name                  = "${var.name}-${each.key}"
  project               = var.project
  region                = var.region
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = each.value.cloud_run_name
  }
}

resource "google_compute_backend_service" "services" {
  for_each = var.services

  name    = "${var.name}-${each.key}"
  project = var.project

  protocol              = "HTTPS"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  security_policy       = var.enable_cloud_armor ? google_compute_security_policy.this[0].id : null

  log_config {
    enable      = true
    sample_rate = 1.0
  }

  backend {
    group = google_compute_region_network_endpoint_group.services[each.key].id
  }
}

# Cloud Armor: a per-IP throttle, enforced, and the OWASP rule set in preview.
resource "google_compute_security_policy" "this" {
  count = var.enable_cloud_armor ? 1 : 0

  name    = "${var.name}-armor"
  project = var.project

  # Preview evaluates and logs `preconfiguredExprIds` without refusing anything.
  # Every backend here is a JSON API with parameterised sinks, and enforced, the
  # CRS body rules refused prose and Cypher while catching only probes against
  # paths nothing serves.
  dynamic "rule" {
    for_each = var.owasp_rules
    content {
      priority = rule.value.priority
      action   = rule.value.action
      preview  = true

      match {
        expr {
          expression = rule.value.expression
        }
      }

      description = rule.value.description
    }
  }

  rule {
    priority    = 1000
    action      = "throttle"
    description = "Per-IP request throttle"

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }

    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"

      rate_limit_threshold {
        count        = var.rate_limit_threshold
        interval_sec = var.rate_limit_interval_sec
      }
    }
  }

  rule {
    priority    = 2147483647
    action      = "allow"
    description = "Default allow"

    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }
}

# Removing a service from `var.services` needs two applies, and the first one
# fails: GCP refuses to delete a backend service the url map still references
# ("resourceInUseByAnotherResource"), and terraform cannot order it, because the
# reference it would order against is exactly what the config just removed. A
# depends_on here would invert the creation order and break a first apply.
#
# So: apply -target this url map, then apply. #166 hit it on dev when the auth
# backend left, and it waits for test and prod. See docs/deployment.md.
resource "google_compute_url_map" "this" {
  name    = var.name
  project = var.project

  default_service = google_compute_backend_service.services[var.default_service].id

  dynamic "host_rule" {
    for_each = var.services
    content {
      hosts        = host_rule.value.domains
      path_matcher = host_rule.key
    }
  }

  dynamic "path_matcher" {
    for_each = var.services
    content {
      name            = path_matcher.key
      default_service = google_compute_backend_service.services[path_matcher.key].id
    }
  }
}

locals {
  all_domains      = flatten([for s in var.services : s.domains])
  cert_domains     = length(var.cert_domains) > 0 ? var.cert_domains : local.all_domains
  cert_domain_hash = substr(sha1(join(",", sort(local.cert_domains))), 0, 8)
}

# Google-managed cert SANs are immutable. Encoding a hash of the domain set
# in the name lets `create_before_destroy` rotate the cert resource cleanly
# whenever SANs change: a new cert is provisioned with a new name, the target
# https proxy is repointed, then the old cert is deleted.
resource "google_compute_managed_ssl_certificate" "this" {
  name    = "${var.name}-cert-${local.cert_domain_hash}"
  project = var.project

  managed {
    domains = local.cert_domains
  }

  lifecycle {
    create_before_destroy = true
  }
}

# The second certificate, for names being introduced. Same hash-in-the-name
# rotation as above, which is now harmless: a change here cannot affect what the
# certificate above already serves.
resource "google_compute_managed_ssl_certificate" "additional" {
  count = length(var.additional_cert_domains) > 0 ? 1 : 0

  name    = "${var.name}-cert-alt-${substr(sha1(join(",", sort(var.additional_cert_domains))), 0, 8)}"
  project = var.project

  managed {
    domains = sort(var.additional_cert_domains)
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Google's default profile still negotiates TLS 1.0 and 1.1. Stated rather than
# inherited; MODERN keeps every browser these surfaces support.
resource "google_compute_ssl_policy" "tls" {
  name            = "${var.name}-tls"
  project         = var.project
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
}

resource "google_compute_target_https_proxy" "this" {
  name       = var.name
  project    = var.project
  url_map    = google_compute_url_map.this.id
  ssl_policy = google_compute_ssl_policy.tls.id

  # Both certificates, so a name being introduced serves without the live one
  # rotating. A proxy takes up to fifteen.
  #
  # Left configured even once the certificate map is attached and ignoring them,
  # because that is the rollback: clearing the map returns these to service
  # without waiting on anything to provision.
  ssl_certificates = concat(
    [google_compute_managed_ssl_certificate.this.id],
    google_compute_managed_ssl_certificate.additional[*].id
  )

  certificate_map = var.attach_certificate_map && length(var.wildcard_domains) > 0 ? "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.this[0].id}" : null
}

resource "google_compute_global_forwarding_rule" "https" {
  name    = "${var.name}-https"
  project = var.project

  ip_address            = google_compute_global_address.this.address
  port_range            = "443"
  target                = google_compute_target_https_proxy.this.id
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

# HTTP → HTTPS redirect
resource "google_compute_url_map" "redirect" {
  name    = "${var.name}-redirect"
  project = var.project

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "${var.name}-redirect"
  project = var.project
  url_map = google_compute_url_map.redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name    = "${var.name}-http"
  project = var.project

  ip_address            = google_compute_global_address.this.address
  port_range            = "80"
  target                = google_compute_target_http_proxy.redirect.id
  load_balancing_scheme = "EXTERNAL_MANAGED"
}

# ── Wildcard certificates, through Certificate Manager ───────────────────────
#
# DNS authorization proves control of the parent domain by a CNAME rather than by
# serving the name, which is what lets a certificate exist for a hostname that
# has no record yet. That is the whole reason a wildcard can be issued ahead of
# the app it will serve.
#
# The record has to be created in whichever zone holds the domain, and those
# zones live in the shared stack rather than here. `dns_authorization_records`
# below is what that stack consumes.
locals {
  wildcard_domains = toset(var.wildcard_domains)
}

resource "google_certificate_manager_dns_authorization" "wildcard" {
  for_each = local.wildcard_domains

  name        = "${var.name}-dnsauth-${replace(each.key, ".", "-")}"
  project     = var.project
  domain      = each.key
  description = "Wildcard issuance for *.${each.key}."
}

resource "google_certificate_manager_certificate" "wildcard" {
  for_each = local.wildcard_domains

  name    = "${var.name}-wildcard-${replace(each.key, ".", "-")}"
  project = var.project

  managed {
    # The parent as well as the wildcard: *.example.com does not match
    # example.com, and a certificate missing its own apex is the omission nobody
    # notices until something serves the bare name.
    domains            = ["*.${each.key}", each.key]
    dns_authorizations = [google_certificate_manager_dns_authorization.wildcard[each.key].id]
  }
}

resource "google_certificate_manager_certificate_map" "this" {
  count = length(var.wildcard_domains) > 0 ? 1 : 0

  name        = "${var.name}-certmap"
  project     = var.project
  description = "Wildcard certificates for ${var.name}."
}

# One entry per hostname pattern. A map matches SNI against these, so both the
# wildcard and the apex need naming even though one certificate covers both.
resource "google_certificate_manager_certificate_map_entry" "wildcard" {
  for_each = local.wildcard_domains

  name         = "${var.name}-entry-${replace(each.key, ".", "-")}"
  project      = var.project
  map          = google_certificate_manager_certificate_map.this[0].name
  certificates = [google_certificate_manager_certificate.wildcard[each.key].id]
  hostname     = "*.${each.key}"
}

resource "google_certificate_manager_certificate_map_entry" "apex" {
  for_each = local.wildcard_domains

  name         = "${var.name}-entry-apex-${replace(each.key, ".", "-")}"
  project      = var.project
  map          = google_certificate_manager_certificate_map.this[0].name
  certificates = [google_certificate_manager_certificate.wildcard[each.key].id]
  hostname     = each.key
}

# The fallback for an SNI no entry matches. Without one such a handshake fails
# outright; with one it gets a certificate that will not validate, which is the
# same refusal but debuggable from the client side.
resource "google_certificate_manager_certificate_map_entry" "primary" {
  count = length(var.wildcard_domains) > 0 ? 1 : 0

  name         = "${var.name}-entry-primary"
  project      = var.project
  map          = google_certificate_manager_certificate_map.this[0].name
  certificates = [google_certificate_manager_certificate.wildcard[var.wildcard_domains[0]].id]
  matcher      = "PRIMARY"
}

# What the shared stack has to create, per domain. Feeding it as a variable there
# matches how the load-balancer IPs already cross that boundary.
output "dns_authorization_records" {
  description = "CNAMEs to create in each domain's zone before its certificate can provision."
  value = {
    for domain, authorization in google_certificate_manager_dns_authorization.wildcard :
    domain => {
      name = authorization.dns_resource_record[0].name
      type = authorization.dns_resource_record[0].type
      data = authorization.dns_resource_record[0].data
    }
  }
}

output "certificate_map_name" {
  description = "Certificate map serving this load balancer's wildcards, once attached."
  value       = length(var.wildcard_domains) > 0 ? google_certificate_manager_certificate_map.this[0].name : null
}
