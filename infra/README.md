# Infrastructure

Terraform for the platform's GCP estate. Three environment projects plus a
shared one that owns DNS.

```
modules/
  cloud-run/          the deployable service
  cloud-sql/          Postgres + its db-url secret
  artifact-registry/  the Docker repository and its retention policy
  load-balancer/      global HTTPS LB, Cloud Armor, managed certificate, TLS policy
  github-wif/         Workload Identity Federation for GitHub Actions
  memgraph-gce/       the graph projection's VM

environments/
  dev/     platform-dev-495017      europe-west3
  test/    platform-test-495017     europe-west3
  prod/    platform-prod-495017     europe-west3
  shared/  platform-shared-495022   DNS only
```

Each environment is a fully isolated project: its own VPC, Cloud SQL, Artifact
Registry, bucket, secrets and load balancer. Nothing crosses at runtime. State
lives in `gs://platform-${env}-495017-tfstate/infra`.

An environment is roughly one file per concern: `database.tf`,
`file-storage.tf`, `document-index.tf`, `graph-database.tf`, `load-balancer.tf`,
`iam.tf`, `apis.tf`, `artifact-registry.tf`, plus one `service.<name>.tf` per
Cloud Run service and a `locals.tf` that derives every hostname from one domain
variable.

## Applying it

```sh
gh workflow run infra.yml -f environment=dev -f action=plan
gh workflow run infra.yml -f environment=dev -f action=apply
```

A pull request touching `infra/` gets a plan against dev automatically, run by a
read-only identity that holds no project roles.

Local `terraform apply` is for bootstrapping a project that has no Workload
Identity pool yet, and for the two cases where the resource graph has to be
walked in a specific order (see below). Everything else goes through the
workflow, so the state bucket has one writer.

## Two ordering traps

**A managed certificate created before its A record answers** sticks at
`FAILED_NOT_VISIBLE` and cannot be replaced in place; it has to be destroyed and
recreated. Since one apply creates both the address and the certificate, a new
environment mints the address on its own first, publishes the record from
`shared/`, waits for `dig` to answer, and only then applies the rest.

**A hostname needs a url-map host rule, not just a certificate SAN.** A name
that is on the certificate but absent from the host rules resolves, serves TLS,
and falls through to the default backend, which answers plausibly enough that
`/health` proves nothing. Both `locals.tf` and `load-balancer.tf` name each
host, and they have to agree.

## Domains

Two domains, mid-cutover. `var.domain` is `platform.sparc.build`, the one being
retired; `var.additional_domain` is `platform.os.build`, the one being moved to.
`locals.tf` derives every hostname from one or the other plus the environment
label, and prod sits at the os.build apex with no label because it was stood up
after the move and never took a name it would have to retire.

A new name is added **beside** the live certificate, never inside it:
`additional_cert_domains` is a second certificate, because dropping or changing
a SAN cannot be done in place and rotates the whole thing. That is also why
retired names linger in `cert_domains` after their service is gone, and why
removing one is a maintenance window rather than a commit.

The shared stack owns both zones in `platform-shared-495022`: `dns.tf` for the
old names, `dns.platform-os-build.tf` for the new. Each environment's load
balancer address arrives there as a variable, and the new zone generates one
record per service per environment from it. Only Google-managed certificates
are used, which the CAA record pins.

buildOS ID's hostnames are consumed, never owned: `locals.tf` derives them from
`var.identity_domain` the same way, so an environment is one variable rather
than a list of URLs somebody keeps in step by hand.

## Security posture

| Concern    | Mechanism                                                                             |
| ---------- | ------------------------------------------------------------------------------------- |
| Secrets    | Secret Manager. Terraform declares the containers; values arrive from `sync-secrets.yml`, so state holds no plaintext |
| CI auth    | Workload Identity Federation, no keys. The provider's `attribute_condition` decides which refs may impersonate at all |
| Runtime SA | Read-only on Secret Manager, Artifact Registry and Cloud SQL                           |
| Database   | Reached over the `/cloudsql/<connection>` socket, IAM database authentication declared rather than clicked |
| Edge       | Cloud Armor: per-IP rate limit, enforced, plus the OWASP rule set in preview. One policy per load balancer, attached to every backend |
| TLS        | Floor of 1.2 with the MODERN profile, pinned by a TLS policy. Google's default still negotiates 1.0 |
| Images     | Buildkit SLSA provenance and an SBOM per image                                          |

The OWASP rules run in preview: a hit is logged with its `preconfiguredExprIds`
and the request goes through. Every backend is a JSON API whose bodies carry
prose, code and Cypher by design, and enforcing the rules refused those while
catching only probes against paths nothing serves. Turning enforcement back on
is the one `preview` flag in the module.

## Not here

Database content and migrations belong to the deploy pipeline. GitHub repository
settings (branch protection, Environment approvals and variables) are configured
in GitHub. Monitoring alerts are still set up by hand. All three are in
[`docs/operations.md`](../docs/operations.md), along with the grants Terraform
cannot bootstrap for itself and the scaling knobs on each resource.
