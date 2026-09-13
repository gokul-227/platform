# Proof of domain control for the wildcard certificates each environment issues.
#
# Certificate Manager validates a domain by a CNAME rather than by serving the
# name, which is the property the whole arrangement rests on: a certificate for
# *.dev.platform.os.build can exist before any host under it does, so adding an
# app never waits on, or touches, a certificate.
#
# The authorization lives in the environment's own project, beside the
# certificate that references it. The record has to live here, because this stack
# owns the zones. That split is why these values are an input rather than a
# reference, the same way the load-balancer IPs already cross this boundary.
#
# Each value comes from `terraform output dns_authorization_records` in the
# environment that produced it. They are stable for the life of the
# authorization; recreating one issues a new target and this has to follow.
variable "certificate_authorizations" {
  type = map(object({
    record = string
    target = string
  }))
  description = "Per-domain DNS authorization CNAMEs, keyed by the domain being authorized."

  default = {
    "dev.platform.os.build" = {
      record = "_acme-challenge.dev.platform.os.build."
      target = "021c9928-f031-4ce9-b806-ae1dcd196edf.2.authorize.certificatemanager.goog."
    }
    "dev.platform.sparc.build" = {
      record = "_acme-challenge.dev.platform.sparc.build."
      target = "02fbfdb6-be72-474d-861e-d2ef38405b04.2.authorize.certificatemanager.goog."
    }
  }
}

# Routed to a zone by suffix rather than by a second field per entry: the two
# domains this estate issues under are the two zones below, and a key that
# matches neither is a mistake worth failing on rather than defaulting.
resource "google_dns_record_set" "certificate_authorization" {
  for_each = var.certificate_authorizations

  name         = each.value.record
  managed_zone = endswith(each.key, "os.build") ? google_dns_managed_zone.platform_os_build.name : google_dns_managed_zone.platform.name
  type         = "CNAME"
  ttl          = 300
  project      = var.project

  rrdatas = [each.value.target]
}
