resource "google_dns_managed_zone" "platform" {
  name        = "platform-sparc-build"
  dns_name    = "${var.domain}."
  description = "Authoritative DNS for ${var.domain}, delegated from sparc.build at the registrar."
  visibility  = "public"
  project     = var.project

  depends_on = [google_project_service.dns]
}

# CAA — restrict cert issuance to Google's pki.goog (covers Google-managed certs).
# Block any other CA from issuing for the zone, including wildcards.
resource "google_dns_record_set" "caa" {
  name         = "${var.domain}."
  managed_zone = google_dns_managed_zone.platform.name
  type         = "CAA"
  ttl          = 3600
  project      = var.project

  rrdatas = [
    "0 issue \"pki.goog\"",
    "0 issue \"letsencrypt.org\"",
    "0 issuewild \"pki.goog\"",
    "0 issuewild \"letsencrypt.org\"",
  ]
}

# ─── locus.sparc.build (parked, for future use) ─────────────────────────────
# Empty zone so the subdomain can be delegated now and filled with records later.
resource "google_dns_managed_zone" "locus" {
  name        = "locus-sparc-build"
  dns_name    = "locus.sparc.build."
  description = "Authoritative DNS for locus.sparc.build (parked; records added when needed)."
  visibility  = "public"
  project     = var.project

  depends_on = [google_project_service.dns]
}

resource "google_dns_record_set" "locus_caa" {
  name         = "locus.sparc.build."
  managed_zone = google_dns_managed_zone.locus.name
  type         = "CAA"
  ttl          = 3600
  project      = var.project

  rrdatas = [
    "0 issue \"pki.goog\"",
    "0 issuewild \"pki.goog\"",
  ]
}

# ─── dev ────────────────────────────────────────────────────────────────────
# TODO: when a frontend exists, add `app.dev.platform.sparc.build` (and the
# matching `app.test.…` / `app.platform.…` records) pointing at the host that
# serves the SPA — likely a separate LB or a Vercel/Netlify CNAME, NOT the
# api LB IP. Also: extend the platform-api LB cert SANs (or provision a
# separate cert) to cover the app hostname if it shares the LB.
#
resource "google_dns_record_set" "api_dev" {
  name         = "api.dev.${var.domain}."
  managed_zone = google_dns_managed_zone.platform.name
  type         = "A"
  ttl          = 60
  rrdatas      = [var.dev_lb_ip]
  project      = var.project
}

# `auth.dev.<domain>` is retired. The name outlived the app it belonged to
# because the load balancer's certificate carried it as a SAN; dev serves from
# wildcards now, so nothing names it. While it resolved it matched no host rule
# and answered from the default backend, which is the platform api.

# `mcp.dev.<domain>` shares the dev LB IP with `api.dev.<domain>`. Host-based
# routing in the LB url_map sends the request to the mcp backend service.
resource "google_dns_record_set" "mcp_dev" {
  name         = "mcp.dev.${var.domain}."
  managed_zone = google_dns_managed_zone.platform.name
  type         = "A"
  ttl          = 60
  rrdatas      = [var.dev_lb_ip]
  project      = var.project
}

# ── Resend mail records: mail.dev.<domain> ──────────────────────────────────
# Transactional sender for the dev env. Values come from Resend's domain panel
# after registering `mail.dev.platform.sparc.build`. Resend uses SES under the
# hood, so SPF / MX sit on the `send.<mail-domain>` subdomain for return-path
# handling, while DKIM signs as the `mail.<domain>` itself. DMARC is set to
# `p=none` (monitor only); tighten to `p=quarantine` once aggregate reports
# show clean alignment. To start collecting reports, append
# `rua=mailto:postmaster@platform.sparc.build` to the DMARC value below.
resource "google_dns_record_set" "mail_dev_dkim" {
  name         = "resend._domainkey.mail.dev.${var.domain}."
  managed_zone = google_dns_managed_zone.platform.name
  type         = "TXT"
  ttl          = 3600
  rrdatas      = ["p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDOJA5kne9feecdTpNXdT5lpFpTdGY71qts/ANlWNKEMwZZHen39FkxYsLH2P+YA5QHPdFPke+YflA1YPlhWr4AbJLfJavWtJq1kWPdpt3qjYi2+mRzTzSbkwmwkDxn+7va1RfXeoQSwKqImZdzePzzn+/SgEolQ86S5PwqUoOi5wIDAQAB"]
  project      = var.project
}

# SPF authorizes Amazon SES (Resend's underlying sender) to emit mail with a
# Return-Path on `send.mail.dev.<domain>`. ~all = soft-fail unknown senders so
# we can observe alignment in DMARC aggregate reports before tightening.
resource "google_dns_record_set" "mail_dev_spf" {
  name         = "send.mail.dev.${var.domain}."
  managed_zone = google_dns_managed_zone.platform.name
  type         = "TXT"
  ttl          = 3600
  rrdatas      = ["\"v=spf1 include:amazonses.com ~all\""]
  project      = var.project
}

# MX on the same `send.<mail-domain>` subdomain so bounces and feedback loop
# (FBL) reports flow back to SES, which Resend ingests for delivery analytics.
resource "google_dns_record_set" "mail_dev_mx" {
  name         = "send.mail.dev.${var.domain}."
  managed_zone = google_dns_managed_zone.platform.name
  type         = "MX"
  ttl          = 3600
  rrdatas      = ["10 feedback-smtp.eu-west-1.amazonses.com."]
  project      = var.project
}

# DMARC policy. Sits on `_dmarc.mail.dev.<domain>` per RFC 7489. `p=none`
# starts in monitor mode: receivers report alignment failures but still
# deliver. Tighten once we have data.
resource "google_dns_record_set" "mail_dev_dmarc" {
  name         = "_dmarc.mail.dev.${var.domain}."
  managed_zone = google_dns_managed_zone.platform.name
  type         = "TXT"
  ttl          = 3600
  rrdatas      = ["\"v=DMARC1; p=none;\""]
  project      = var.project
}

# ── Resend mail records: mail.test.<domain> ─────────────────────────────────
# Mirrors the dev block above. DKIM key is unique per Resend domain; SPF / MX
# / DMARC values are env-independent (same SES return-path infra).
resource "google_dns_record_set" "mail_test_dkim" {
  name         = "resend._domainkey.mail.test.${var.domain}."
  managed_zone = google_dns_managed_zone.platform.name
  type         = "TXT"
  ttl          = 3600
  rrdatas      = ["p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDcSKa/dmqEWnAOw0qu3lDT0b+ThQ+KF3dCWGQiy5NRb9/Dbs0CNGYpeY0iNnG+n8lwaLVETP5a3h+iiVCE2mandMBW7DKFnnwK8IxoCHQTc8ayA6eeOSutznI3ZQA5Tv2xjIHCDy9fbtBbvBDdqfDMBcfPB0Ky0GEwrHttBnhgZwIDAQAB"]
  project      = var.project
}

resource "google_dns_record_set" "mail_test_spf" {
  name         = "send.mail.test.${var.domain}."
  managed_zone = google_dns_managed_zone.platform.name
  type         = "TXT"
  ttl          = 3600
  rrdatas      = ["\"v=spf1 include:amazonses.com ~all\""]
  project      = var.project
}

resource "google_dns_record_set" "mail_test_mx" {
  name         = "send.mail.test.${var.domain}."
  managed_zone = google_dns_managed_zone.platform.name
  type         = "MX"
  ttl          = 3600
  rrdatas      = ["10 feedback-smtp.eu-west-1.amazonses.com."]
  project      = var.project
}

resource "google_dns_record_set" "mail_test_dmarc" {
  name         = "_dmarc.mail.test.${var.domain}."
  managed_zone = google_dns_managed_zone.platform.name
  type         = "TXT"
  ttl          = 3600
  rrdatas      = ["\"v=DMARC1; p=none;\""]
  project      = var.project
}

# ─── test ───────────────────────────────────────────────────────────────────
resource "google_dns_record_set" "api_test" {
  count        = var.test_lb_ip == "" ? 0 : 1
  name         = "api.test.${var.domain}."
  managed_zone = google_dns_managed_zone.platform.name
  type         = "A"
  ttl          = 60
  rrdatas      = [var.test_lb_ip]
  project      = var.project
}

# `auth.test.<domain>` is the same retired name as dev's, still resolving because
# the test certificate carries it as a SAN and dropping a SAN rotates the
# certificate. It goes when test moves onto its wildcard map.
resource "google_dns_record_set" "auth_test" {
  count        = var.test_lb_ip == "" ? 0 : 1
  name         = "auth.test.${var.domain}."
  managed_zone = google_dns_managed_zone.platform.name
  type         = "A"
  ttl          = 60
  rrdatas      = [var.test_lb_ip]
  project      = var.project
}

# The test load balancer's certificate carries this name as a SAN, held there
# because dropping a SAN rotates the certificate and takes TLS down for every
# name on the proxy. A SAN with no record cannot validate, so the certificate
# stayed at PROVISIONING with FAILED_NOT_VISIBLE against this one domain while
# serving the other two. The record resolves it to the load balancer, where the
# default backend answers; the SAN itself comes out in a maintenance window.
resource "google_dns_record_set" "platform_test" {
  count        = var.test_lb_ip == "" ? 0 : 1
  name         = "test.${var.domain}."
  managed_zone = google_dns_managed_zone.platform.name
  type         = "A"
  ttl          = 60
  rrdatas      = [var.test_lb_ip]
  project      = var.project
}

# No `mcp.test.…` record: apps/api serves /mcp on the api hostname.

# ─── prod ───────────────────────────────────────────────────────────────────
# No records. prod is served entirely from platform.os.build
# (dns.platform-os-build.tf), so it never takes a name under the domain being
# retired; `prod_lb_ip` feeds that zone instead.