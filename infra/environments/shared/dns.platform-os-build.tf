# platform.os.build — where the platform is moving, beside identity.
#
# buildOS currently straddles two parents: identity is at id.os.build and the
# platform at platform.sparc.build, so nothing about the estate reads as one
# product and two registrars hold pieces of it. This zone is the platform's half
# of os.build, a sibling of id.os.build rather than a child of it, so the two
# repos stay independent in DNS as they are in code: one delegation each, from
# whoever runs os.build, and neither zone holds the other's records.
#
# Records only. The hostnames themselves stay on platform.sparc.build until this
# zone is delegated and resolving, because a Google-managed certificate created
# before its A record answers sticks at FAILED_NOT_VISIBLE and cannot be
# replaced in place; it has to be destroyed and recreated. So the order is:
# apply this, hand the nameservers over, wait for resolution, and only then add
# the new names to each environment's `cert_domains`. Both names serve during
# the cutover, and the old ones come out afterwards.
#
# The apex has no record yet. Nothing serves it: the platform app is not
# deployed, and pointing it at the load balancer would hand visitors whatever
# the default backend happens to be.
resource "google_dns_managed_zone" "platform_os_build" {
  name        = "platform-os-build"
  dns_name    = "platform.os.build."
  description = "Authoritative DNS for platform.os.build, delegated from os.build."
  visibility  = "public"
  project     = var.project

  depends_on = [google_project_service.dns]
}

# Only Google may issue for this zone.
#
# Narrower than the two older zones here, which also allow letsencrypt.org, and
# matching id.os.build instead. Every certificate in this estate is a
# Google-managed one on the load balancer, so a second issuer widens who can
# mint a certificate for these names and buys nothing. Adding one later is a
# line; the reverse costs whatever was already issued through it, which is why
# the older zones keep theirs until somebody checks.
resource "google_dns_record_set" "platform_os_build_caa" {
  name         = google_dns_managed_zone.platform_os_build.dns_name
  managed_zone = google_dns_managed_zone.platform_os_build.name
  type         = "CAA"
  ttl          = 3600
  project      = var.project

  rrdatas = [
    "0 issue \"pki.goog\"",
    "0 issuewild \"pki.goog\"",
  ]
}

# One A record per hostname an environment serves, from one map rather than a
# resource each: the old zone spells out sixteen near-identical blocks, and the
# next hostname added there is the one somebody forgets in an environment.
#
# `auth` is deliberately absent. It belongs to the Better Auth app that buildOS
# ID replaces, so carrying it here would give a new name to something being
# removed.
locals {
  platform_os_build_ips = {
    dev  = var.dev_lb_ip
    test = var.test_lb_ip
    prod = var.prod_lb_ip
  }

  # prod sits at the zone apex, non-prod under its own label, which is the shape
  # both this estate and platform-id already use.
  platform_os_build_hosts = merge([
    for env, ip in local.platform_os_build_ips : {
      for service in ["api", "mcp"] :
      "${service}-${env}" => {
        name = env == "prod" ? "${service}.platform.os.build." : "${service}.${env}.platform.os.build."
        ip   = ip
      }
    } if ip != ""
  ]...)
}

resource "google_dns_record_set" "platform_os_build_hosts" {
  for_each = local.platform_os_build_hosts

  name         = each.value.name
  managed_zone = google_dns_managed_zone.platform_os_build.name
  type         = "A"
  ttl          = 300
  project      = var.project

  rrdatas = [each.value.ip]
}

# What to hand whoever runs os.build. They add one NS record set for
# platform.os.build pointing at these four names, and nothing else changes for
# them: this zone is a sibling of id.os.build, not a parent or a child of it.
output "platform_os_build_nameservers" {
  description = "Give these to whoever runs os.build, as the NS record set for platform.os.build."
  value       = google_dns_managed_zone.platform_os_build.name_servers
}

output "platform_os_build_records" {
  description = "Hostnames this zone answers for once delegated. Certificates come after they resolve."
  value       = [for host in local.platform_os_build_hosts : trimsuffix(host.name, ".")]
}
