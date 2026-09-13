# Operations

The things Terraform cannot do for itself, and the procedures worth having
written down before you need them. Day-to-day releases are
[deployment.md](deployment.md).

Three GCP projects, one per environment, plus a shared one that owns DNS:

| Env    | Project                  | Region       |
| ------ | ------------------------ | ------------ |
| dev    | `platform-dev-495017`    | europe-west3 |
| test   | `platform-test-495017`   | europe-west3 |
| prod   | `platform-prod-495017`   | europe-west3 |
| shared | `platform-shared-495022` | (DNS only)   |

Each environment is fully isolated: its own VPC, Cloud SQL, Artifact Registry,
bucket and secrets. Nothing crosses at runtime.

## Bootstrapping a new environment

Everything here runs once, by hand, as an identity with `roles/owner` on the
project (`gcloud auth application-default login` from a workstation). After
Workload Identity is wired, CI takes over and none of it is repeated.

**1. The project and its billing.** `google_project` creation needs an org admin
or a billing-attached identity, so Terraform cannot be the thing that creates
the project it manages.

```sh
gcloud projects create platform-test-495017 --name="Platform (test)"
gcloud beta billing projects link platform-test-495017 --billing-account=<BILLING_ACCOUNT_ID>
```

**2. The state bucket**, which must exist before `terraform init`. Versioning is
a separate call because `create` has no flag for it.

```sh
gcloud storage buckets create gs://platform-test-495017-tfstate --project=platform-test-495017 --location=europe-west3 --uniform-bucket-level-access
gcloud storage buckets update gs://platform-test-495017-tfstate --versioning
```

**3. Two bootstrap APIs.** `google_project_service` depends on both, so
Terraform cannot enable the APIs that let it enable APIs.

```sh
gcloud services enable cloudresourcemanager.googleapis.com serviceusage.googleapis.com --project=platform-test-495017
```

**4. The first apply.**

```sh
cd infra/environments/test && terraform init && terraform apply
```

This creates the remaining API enablements, the Artifact Registry repository,
the Workload Identity pool, provider and deploy identity, the Cloud Run runtime
identity, Cloud SQL and its `db-url` secret, the secret containers the service
mounts, and the load balancer with its Cloud Armor policy. Capture the outputs:
`workload_identity_provider`, `deploy_service_account`, `load_balancer_ip`.

## Three grants Terraform cannot bootstrap

Each of these fails a CI run in a way that names the symptom and not the cause,
and each is a one-line fix that has to happen once per environment after the
first apply.

**The deploy identity on the state bucket.** Without it every `infra.yml` run
fails at `terraform init` with `storage.objects.list denied`. The identity is
created by the apply, and the bucket was created by hand, so nothing in the
apply can grant this.

```sh
gcloud storage buckets add-iam-policy-binding gs://platform-test-495017-tfstate --member=serviceAccount:github-deploy@platform-test-495017.iam.gserviceaccount.com --role=roles/storage.objectUser
```

**The plan identity on the state bucket**, read-only. The plan-on-PR identity
(`github-plan@`, created where `enable_plan_identity = true`) holds no project
roles by design, so it can read neither other buckets nor the project itself.
Reading remote state to diff a plan is the one thing it needs, granted
bucket-scoped because the CI deploy identity cannot `setIamPolicy` on a
manually created bucket.

```sh
gcloud storage buckets add-iam-policy-binding gs://platform-test-495017-tfstate --member=serviceAccount:github-plan@platform-test-495017.iam.gserviceaccount.com --role=roles/storage.objectViewer
```

**Custom-role admin on the project.** `deploy_roles` declares
`roles/iam.roleAdmin`, but Terraform cannot be what first grants it: the estate
owns a custom role, refreshing that resource needs the permission, and the read
happens before any apply can reach the binding that would confer it. The first
apply after a custom role exists fails with `Error 403 ... permission to get the
role` and keeps failing until this runs.

```sh
gcloud projects add-iam-policy-binding platform-test-495017 --member=serviceAccount:github-deploy@platform-test-495017.iam.gserviceaccount.com --role=roles/iam.roleAdmin
```

`projectIamAdmin`, which the identity already holds, is not this: it grants a
role to a member and says nothing about reading or creating the role itself.

## Wiring GitHub to GCP

Per **Environment** (Settings → Environments → {env} → Variables), so a job that
declares `environment:` resolves them:

| Variable              | Source                                        |
| --------------------- | --------------------------------------------- |
| `WIF_PROVIDER`        | `terraform output workload_identity_provider` |
| `WIF_SERVICE_ACCOUNT` | `terraform output deploy_service_account`      |

The plan-on-PR identity is the exception and goes at **repository** level,
because `plan-dev` runs on `pull_request` with no `environment:` and dev's
deployment-branch policy is `main`-only, which would make an Environment-scoped
variable unreachable from a PR ref:

| Variable                   | Source                                             |
| -------------------------- | -------------------------------------------------- |
| `WIF_PROVIDER_PLAN`        | `terraform output plan_workload_identity_provider` |
| `WIF_SERVICE_ACCOUNT_PLAN` | `terraform output plan_service_account`            |

The provider string uses the project **number**, not its id.

Configure the three Environments themselves. `prod` takes required reviewers and
a deployment-branch policy; the branch policies for all three are described
under [the two gates](deployment.md#triggers). Branch protection on `main`
requires a pull request, the `Checks / *` status checks, signed commits, linear
history, and no bypass.

No database credentials are stored in GitHub. `deploy.yml` fetches `db-url` from
Secret Manager at run time, and the deploy identity already holds
`roles/secretmanager.admin` from the `github-wif` module. Secret Manager is the
single source of truth, with no copy to keep in step.

## DNS

Both zones live in the shared project, which is bootstrapped the same way as an
environment (create, link billing, state bucket) and then applied from
`infra/environments/shared`. The CAA record (`0 issue "pki.goog"`) is
provisioned with them, because only Google-managed certificates are used.

Delegation is per zone and per parent. `platform.os.build` is delegated by
whoever runs `os.build`; the retiring `platform.sparc.build` is delegated at the
registrar. `terraform output` gives the four nameservers in each case, and
propagation is usually under 30 minutes:

```sh
dig NS platform.os.build @8.8.8.8 +short
```

When a new environment's load balancer comes online, put its address in that
environment's `*_lb_ip` variable in `infra/environments/shared/variables.tf` and
re-apply `shared`.

## Secrets

Containers are declared in Terraform; **values** are pushed into them by
`sync-secrets.yml` from GitHub Environment secrets, so Terraform state never
holds a plaintext credential. Two secrets travel that way:

| GitHub Environment secret  | Secret Manager id     | Used for                        |
| -------------------------- | --------------------- | ------------------------------- |
| `IDENTITY_WEBHOOK_SECRET`  | `auth-webhook-secret` | the identity back-channel       |
| `PINECONE_API_KEY`         | `pinecone-api-key`    | the document index              |

`db-url` and the graph-database credentials are generated by Terraform and never
leave the project. Vertex and its Model Garden partners need no key at all: the
runtime identity is the credential.

`sync-secrets.yml` is a manual dispatch and nothing calls it for you, so a
container Terraform declared but nobody populated is empty at the first deploy
of an environment. Cloud Run refuses a service whose mounted secret has no
enabled version, and the refusal reads like a broken image. Populate before you
deploy a new environment.

Keeping it manual is also what keeps rotation deliberate. On the deploy path it
would write one version per secret per deploy, each billed for as long as it
stays enabled.

### The identity webhook secret

buildOS ID tells this API about an identity before deleting it, with
`Authorization: Bearer <IDENTITY_WEBHOOK_SECRET>`, and the receiver does a
constant-time compare. One value, two estates: `auth-webhook-secret` here and
`identity-webhook-secret` in the identity project, both fed from the
`IDENTITY_WEBHOOK_SECRET` GitHub Environment secret that each repository's own
`sync-secrets.yml` pushes. The names differ for history. A mismatch refuses
every hook, no user row is ever written, and every authenticated caller then
fails `PRINCIPAL_NOT_PROVISIONED`.

```sh
openssl rand -hex 32 | tr -d '\n' | gh secret set IDENTITY_WEBHOOK_SECRET -R aec-craft/platform -e test
```

Set the **same value** on `aec-craft/platform-id` for that environment, then run
`sync-secrets.yml` in both. Nothing enforces that the two match; the
repositories are separate.

The `tr -d '\n'` matters. A trailing newline is stripped from the
`Authorization` header on the sending side and kept on the verifying side, which
is a silent 401.

### Rotation

- **Database password**, yearly:
  `terraform apply -replace=module.database.random_password.db_password`. The
  `db-url` secret picks it up; service revisions re-read it on the next deploy.
- **Any synced secret**: set the new value in the GitHub Environment, dispatch
  `sync-secrets.yml` for that environment, force a revision roll so the service
  re-reads it, then disable the old version once traffic is confirmed on the
  new one.

## Not in Terraform

- **Monitoring alerts.** Worth having, and currently set up by hand: 5xx rate
  above 1% for 5 minutes, Cloud Run cold-start p95 above 5s for 10 minutes,
  Cloud SQL connections above 80% of capacity, and any sustained Cloud Armor
  `exceed_action`.
- **Database content and migrations**, which belong to the deploy pipeline.
- **GitHub repository settings**: branch protection, Environment approvals, and
  the variables above.

## Scaling

What grows on its own, and what needs a decision.

**Cloud SQL.** Disk auto-resizes. CPU and memory are fixed by `tier` in the
environment's `database.tf`; changing it is an online machine-type change,
roughly a minute of paused queries with no data loss. Connections are capped by
`max_connections`; lower the per-instance pool before raising the cap. dev runs
zonal, prod regional. There is no read replica, and adding one means a second
connection in the app as well as a Terraform resource.

Note for a new instance: state its `edition`. The default is no longer
`ENTERPRISE`, and `ENTERPRISE_PLUS` refuses a `db-custom` tier with a message
about tiers that says nothing about editions.

**Cloud Run.** Instances scale between `min_instances` and `max_instances` in
`service.platform-api.tf`. Memory, CPU and concurrency are fixed per service and
overridden on the module call.

**Cloud Armor.** A per-IP rate limit, enforced, plus the OWASP rule set in
preview, on the load-balancer module call in `${env}/load-balancer.tf`. A
preview hit is logged under `previewSecurityPolicy.preconfiguredExprIds` while
`enforcedSecurityPolicy` shows the throttle; nothing is refused by a body, so no
route needs a carve-out.
