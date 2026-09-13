# Deployment

What deploys where, on which trigger, and how to undo it. Standing an
environment up for the first time is [operations.md](operations.md).

## Triggers

| Action                        | Result                                                  |
| ----------------------------- | ------------------------------------------------------- |
| Push or merge to `main`       | dev                                                     |
| Tag `vX.Y.Z-beta.N`           | test                                                    |
| Tag `vX.Y.Z` (no suffix)      | prod, behind a required approval on the `prod` Environment |
| `Run workflow` on **Deploy**  | the environment you pick, at an optional sha            |

A tag matching neither pattern (`v1.2.3-rc.1`, `v1.2.3-alpha.1`) does not
deploy. The workflow logs a warning and exits 0.

A `main` push that changed nothing deployable (infra, CI, docs, a changeset)
skips the redundant dev redeploy of identical images. The filter is fail-open:
if detection is inconclusive, the deploy proceeds.

**Two gates decide whether a trigger reaches an environment, and both must admit
it.** The Workload Identity provider's `attribute_condition` decides which refs
may impersonate the deploy identity at all. The Environment's own deployment
branch policy then decides which of those may deploy to it. Which trigger
deploys where stays decided in the workflow, not by the policy.

Today the provider's condition is `assertion.ref in [refs/heads/main]`, and `in`
cannot express a tag, whose set is unbounded. So the tag rows above describe the
workflow's intent rather than a path that works: a tag push is refused during
authentication, before any Environment policy is consulted, and the failure
surfaces as a permission error naming nothing about refs. Dev, which deploys
from `main`, is unaffected.

## The pipeline

```
resolve ──▶ checks ──▶ build ──▶ migrate ──▶ deploy ──▶ smoke
```

1. **Resolve target.** Derives environment, sha and GCP project from the
   trigger.
2. **Checks.** Lint, typecheck, test, build (`_checks.yml`).
3. **Build images.** Docker buildx to that environment's Artifact Registry,
   tagged with the sha. Buildkit emits in-toto SLSA provenance and an SBOM
   alongside the image.
4. **Migrate.** Through the Cloud SQL Auth Proxy, per slice: every slice's
   `status` first, in one group each, then every slice's `up`. Reading the
   status groups before the apply half is the point of the split, and it matters
   most against a database that has never been migrated.
5. **Deploy.** `gcloud run deploy` rolls the revision for each service in the
   matrix, which is `platform-api` alone. It runs as that environment's
   `cloud-run-platform-api@` identity and reads its secrets through that
   binding.
6. **Smoke.** `GET /health` on the hostname the service claims as its audience,
   retried for a minute. The host here and `PUBLIC_URL` in
   `service.platform-api.tf` must name the same thing: a check against a host
   the service does not claim passes while every authorized call is refused for
   the wrong `aud`.

Secret **values** are not part of this. `sync-secrets.yml` is a manual dispatch,
so a container Terraform declared but nothing ever populated is empty at first
start, and Cloud Run refuses a service whose mounted secret has no enabled
version. That refusal reads like a broken image. Populate before the first
deploy of an environment; see [operations.md](operations.md#secrets).

Deploys are serialized per environment, so concurrent pushes cannot race
migrations.

Shadow-database validation (restore the latest backup to a transient instance,
dry-run the pending migrations, abort on failure) is currently off. The steps to
reinstate it are in a TODO in `.github/workflows/deploy.yml`; gate it on
`env != 'dev'` so dev deploys stay fast.

## Hostnames

Every environment answers on `platform.os.build`:
`api.dev.platform.os.build`, `api.test.platform.os.build`, and
`api.platform.os.build` for prod, which sits at the zone apex.

dev and test also still serve their old `platform.sparc.build` names, on a
second certificate, while that cutover finishes. prod was stood up afterwards
and never took a name it would have to retire. Records live in
`infra/environments/shared/`, which the `platform-shared-495022` project owns:
the old names in `dns.tf`, the new ones in `dns.platform-os-build.tf`.

A Google-managed certificate provisions 15 to 30 minutes after its names
resolve, and one created before its A record answers sticks at
`FAILED_NOT_VISIBLE` and cannot be replaced in place. Address first, then
record, then certificate.

To finish retiring a `sparc.build` name: point every consumer at the new host,
including the ones outside this repository (Kratos's
`SELFSERVICE_ALLOWED_RETURN_URLS`, `apps/id`'s `ALLOWED_RETURN_ORIGINS`, Hydra's
CORS list, and the `redirect_uris` on every OAuth client registered for a
platform surface). A client whose redirect URI still names the old host has its
authorization refused outright. Then drop the hostname, which drops its
certificate with it.

## Standing up test or prod

Neither has been stood up. The Terraform is written and both stacks are
complete, but no apply has run against those projects and the tag path that
would deploy them cannot authenticate yet (see [Triggers](#triggers)).

Both depend on their identity estate, which is a different repository:
`apps/api` reads `KETO_READ_URL`, `KETO_WRITE_URL`, `OIDC_ISSUER` and
`PUBLIC_URL` with `requireEnv`, so it refuses to boot until buildOS ID answers
in that environment. The order below is that dependency, not a preference.

1. **Identity first.** In `aec-craft/platform-id`, run that environment through
   its `docs/deploy.md`. The gate on continuing is
   `https://oauth.{env}.id.os.build/.well-known/openid-configuration` answering.

2. **Confirm Keto's addresses.** `keto_read_url` / `keto_write_url` are derived
   from the identity project's number rather than read off that apply, so check
   them once:

   ```sh
   gcloud run services describe keto-read-test --project platform-id-test --region europe-west3 --format='value(status.url)'
   ```

   A wrong value refuses every authorized request while `/health` stays green,
   which reads as a broken deploy rather than a wrong string.

3. **The shared webhook secret**, one value in both repositories. See
   [operations.md](operations.md#the-identity-webhook-secret).

4. **prod only: the state bucket and the first apply.** Neither exists, and no
   Workload Identity pool exists in that project either, so the first apply runs
   locally as an owner. See
   [operations.md](operations.md#bootstrapping-a-new-environment).

5. **prod only: the address before the certificate.** The same apply creates
   both, so mint the address on its own first:

   ```sh
   cd infra/environments/prod && terraform init && terraform apply -target=module.load_balancer.google_compute_global_address.this
   ```

   Put it in `prod_lb_ip` (`infra/environments/shared/variables.tf`), apply
   `shared`, and wait for `dig +short api.platform.os.build` to answer it.

6. **Apply the environment.**
   `gh workflow run infra.yml -f environment=<env> -f action=apply`. A first
   apply against a project whose APIs were never enabled can fail on
   propagation; re-running is the fix rather than a symptom.

7. **Read the WIF outputs into GitHub**, which is what lets CI apply and deploy
   from then on. Table in [operations.md](operations.md#wiring-github-to-gcp).

8. **Deploy.** `gh workflow run deploy.yml -f environment=<env>`. Populate the
   environment's secret containers first (`sync-secrets.yml`), because Cloud Run
   refuses a service whose mounted secret has no version.

9. **Register the docs portal's OAuth client** in that environment's identity
   console and set `docs_oidc_client_id`. Until then the portal renders with
   nothing to authorize as, which is honest rather than an error.

Two switches stay off deliberately. The document index needs a Pinecone index
per environment before `pinecone_index_host` and its flag mean anything, and the
graph projection needs a Memgraph VM. Both are dormant by design.

## Removing a hostname or a service from the load balancer

Two applies, and the first fails if you skip the targeting. GCP will not delete a
backend service while the url map still points at it, and Terraform cannot order
the two: taking a key out of `services` removes the very reference it would have
ordered against.

```sh
terraform -chdir=infra/environments/<env> apply -target=module.load_balancer.google_compute_url_map.this
terraform -chdir=infra/environments/<env> apply
```

The error names it plainly once you know to expect it:

```
Error 400: The backend_service resource '…-auth' is already being used by
'…/urlMaps/platform-dev', resourceInUseByAnotherResource
```

Certificates are the other half of the same change and behave differently. A
managed certificate cannot be replaced in place, so dropping a SAN rotates it and
takes HTTPS down for every name on the proxy until the new one provisions. Adding
a name is additive and safe; removing one is a maintenance window.

## Rollback

Re-tag a known-good commit and approve prod again:

```sh
git checkout <known-good-sha>
git tag v1.2.4
git push origin v1.2.4
```

The pipeline never deploys an image it did not build itself; there is no path to
push a hand-crafted artifact.

A rollback rolls the image, not the schema: the migrators run forward only and
nothing reverses them. So a migration that the previous revision cannot read is
a migration you cannot roll back past, and that is worth knowing before writing
one rather than during an incident.
