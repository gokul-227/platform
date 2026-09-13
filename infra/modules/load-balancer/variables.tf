variable "project" {
  type = string
}

variable "region" {
  type    = string
  default = "europe-west3"
}

variable "name" {
  type = string
}

variable "services" {
  type = map(object({
    cloud_run_name = string
    domains        = list(string)
  }))
}

variable "default_service" {
  type = string
}

variable "cert_domains" {
  type    = list(string)
  default = []
}

# A second certificate, served beside the first rather than replacing it.
#
# Adding a name to `cert_domains` is not a safe way to add a name. The SANs are
# hashed into the certificate's own name, so a change there provisions a new
# certificate and repoints the proxy at it immediately, while Google is still
# validating every domain on it. That takes 15 to 30 minutes, and for the whole
# of it TLS fails for every host on this load balancer, not only the new one.
#
# Two certificates avoid the question entirely: the live one is untouched, the
# new names provision independently, and SNI picks between them. A migration
# adds names here, waits for ACTIVE, moves traffic, and only then rewrites
# `cert_domains` and accepts one rotation with nothing left depending on it.
variable "additional_cert_domains" {
  type        = list(string)
  description = "Hostnames for a second managed certificate. Empty creates none."
  default     = []
}

variable "enable_cloud_armor" {
  type    = bool
  default = true
}

variable "rate_limit_threshold" {
  type    = number
  default = 300
}

variable "rate_limit_interval_sec" {
  type    = number
  default = 60
}

variable "owasp_rules" {
  type = list(object({
    priority    = number
    action      = string
    expression  = string
    description = string
  }))
  # Sensitivity level controls how aggressive each rule is (1 = paranoid,
  # 4 = strict). XSS + SQLi default-strict false-positive on JSON bodies
  # because `{`, `}`, `"` and `:` look like injection payloads to rules
  # designed for HTML form posts. Level 1 catches obvious attacks without
  # eating every legit POST. LFI/RCE stay strict — they don't trigger on
  # well-formed JSON.
  default = [
    {
      priority    = 100
      action      = "deny(403)"
      expression  = "evaluatePreconfiguredWaf('xss-v33-stable', {'sensitivity': 1})"
      description = "Block reflected XSS attempts (sensitivity 1)"
    },
    {
      priority    = 101
      action      = "deny(403)"
      expression  = "evaluatePreconfiguredWaf('sqli-v33-stable', {'sensitivity': 1})"
      description = "Block SQL-injection attempts (sensitivity 1)"
    },
    {
      priority    = 102
      action      = "deny(403)"
      expression  = "evaluatePreconfiguredExpr('lfi-v33-stable')"
      description = "Block local-file-inclusion attempts"
    },
    {
      priority = 103
      action   = "deny(403)"
      # CRS 932200 opted out, and only that rule. It matches shell-expression
      # syntax anywhere in a request, including headers, so Chrome's own
      # `sec-ch-ua` tripped it and every browser request to this API was refused
      # while curl to the same URL passed. It refused /docs and /favicon.ico,
      # which is the shape of the false positive rather than an attack.
      #
      # The rest of the RCE set stays, as do the LFI rules above it, which are
      # meanwhile blocking real .env probes against the raw address.
      expression  = "evaluatePreconfiguredWaf('rce-v33-stable', {'sensitivity': 1, 'opt_out_rule_ids': ['owasp-crs-v030301-id932200-rce']})"
      description = "Block remote-code-execution patterns, less CRS 932200 (browser-header false positive)"
    },
  ]
}

# Parent domains to cover with a wildcard, one certificate each, issued through
# Certificate Manager with DNS authorization.
#
# This is the shape that makes adding an app free. A classic certificate lists
# every hostname, so a new app is a new SAN, a new certificate and a rotation
# that blacks out every host on this load balancer. A wildcard covers the
# hostname before it exists, so a new app is a DNS record and a backend.
#
# Give the parent, not the pattern: "dev.platform.os.build" yields a certificate
# for *.dev.platform.os.build and for the parent itself, because a wildcard does
# not cover its own apex. One label deep only, so a two-level hostname would
# need its own entry here.
variable "wildcard_domains" {
  type        = list(string)
  description = "Parent domains to issue wildcard certificates for. Empty creates none."
  default     = []
}

# Whether the proxy actually serves the certificate map.
#
# Off by default, and that is the safety property rather than caution: a
# certificate map is not additive. Google's own wording is that a proxy with both
# "uses the certificates referenced by the certificate map and ignores the
# directly attached TLS (SSL) certificates". Attaching a map that does not cover
# a hostname breaks that hostname the instant it is attached, with no
# provisioning delay to notice it in.
#
# So the map is built, its certificates provision, they are confirmed ACTIVE, and
# only then is this flipped. `ssl_certificates` stays configured underneath,
# which makes the rollback one line: clear the map and the classic certificates
# resume serving immediately.
variable "attach_certificate_map" {
  type        = bool
  description = "Point the HTTPS proxy at the certificate map. Only true once every certificate is ACTIVE."
  default     = false
}
