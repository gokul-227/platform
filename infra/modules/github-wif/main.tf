locals {
  ref_condition = join(" || ", concat(
    length(var.allowed_refs) > 0 ? ["assertion.ref in ${jsonencode(var.allowed_refs)}"] : [],
    [for prefix in var.allowed_ref_prefixes : "assertion.ref.startsWith(${jsonencode(prefix)})"],
  ))
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github"
  project                   = var.project
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  project                            = var.project
  display_name                       = "GitHub"

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.actor"            = "assertion.actor"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
    "attribute.ref"              = "assertion.ref"
  }

  # `in` takes exact refs, and a release tag is not one: the set is unbounded, so
  # a tag-triggered deploy authenticates through a prefix or not at all. Which
  # tags reach which environment is not decided here but by that environment's
  # deployment branch policy, so this is the outer of two gates rather than the
  # only one.
  attribute_condition = "assertion.repository == '${var.github_org}/${var.github_repo}' && (${local.ref_condition})"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "deploy" {
  account_id   = "github-deploy"
  display_name = "GitHub Actions Deploy"
  project      = var.project
}

resource "google_service_account_iam_member" "github_wif" {
  service_account_id = google_service_account.deploy.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_org}/${var.github_repo}"
}

resource "google_project_iam_member" "deploy_roles" {
  for_each = toset(var.deploy_roles)

  project = var.project
  role    = each.value
  member  = "serviceAccount:${google_service_account.deploy.email}"
}

# ── Read-only plan identity ──────────────────────────────────────────────────
# Separate pool so PR refs are isolated from the deploy SA. The deploy SA's
# binding (above) is on the `github` pool keyed by attribute.repository; only
# the provider's attribute_condition keeps PR refs out. Rather than loosen that
# condition (which would let any PR mint a deploy token, since the binding is
# repository- not ref-scoped), the plan identity gets its OWN pool whose
# provider only accepts `refs/pull/*/merge`. A token from this pool can satisfy
# the plan SA binding and nothing else.
resource "google_iam_workload_identity_pool" "github_plan" {
  count = var.enable_plan_identity ? 1 : 0

  workload_identity_pool_id = "github-plan"
  project                   = var.project
  display_name              = "GitHub Actions Plan"
}

resource "google_iam_workload_identity_pool_provider" "github_plan" {
  count = var.enable_plan_identity ? 1 : 0

  workload_identity_pool_id          = google_iam_workload_identity_pool.github_plan[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github"
  project                            = var.project
  display_name                       = "GitHub"

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.actor"            = "assertion.actor"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
    "attribute.ref"              = "assertion.ref"
  }

  # PR-event refs only: `pull_request` runs carry `refs/pull/<n>/merge`.
  attribute_condition = "assertion.repository == '${var.github_org}/${var.github_repo}' && assertion.ref.startsWith('refs/pull/') && assertion.ref.endsWith('/merge')"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "plan" {
  count = var.enable_plan_identity ? 1 : 0

  account_id   = "github-plan"
  display_name = "GitHub Actions Plan (read-only)"
  project      = var.project
}

resource "google_service_account_iam_member" "github_plan_wif" {
  count = var.enable_plan_identity ? 1 : 0

  service_account_id = google_service_account.plan[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_plan[0].name}/attribute.repository/${var.github_org}/${var.github_repo}"
}

# Project-level read roles for the plan SA. Empty by default (see plan_roles):
# the only access a -refresh=false plan needs is reading remote state, which is
# granted as bucket-scoped storage.objectViewer on the tfstate bucket out of
# band (docs/operations.md) — the CI deploy SA can't setIamPolicy on that
# manually-bootstrapped bucket, and a project-wide grant here would let this
# identity read every bucket (file storage included).
resource "google_project_iam_member" "plan_roles" {
  for_each = var.enable_plan_identity ? toset(var.plan_roles) : toset([])

  project = var.project
  role    = each.value
  member  = "serviceAccount:${google_service_account.plan[0].email}"
}

# ── Ship-only identity ───────────────────────────────────────────────────────
# The identity every merge to main assumes, and the reason this split exists.
#
# `github-deploy` above holds an editor-equivalent set because one identity does
# three unrelated jobs: ship a container, apply the estate, and sync secrets.
# Only the first runs automatically. So the automatic one carries
# projectIamAdmin, secretmanager.admin, compute.admin and the rest on every
# push, and a compromise of anything that reaches main inherits all of it.
#
# This identity can roll a revision, run a migration job and read the one secret
# that job needs. It cannot grant a role, mint a service account, read any other
# secret, or create or delete a service. Applying the estate stays with
# `github-deploy` until the workflows are moved over, then that account keeps
# only what terraform genuinely needs.
resource "google_service_account" "ship" {
  count = var.enable_ship_identity ? 1 : 0

  account_id   = "github-ship"
  display_name = "GitHub Actions ship-only (revision + migration)"
  project      = var.project
}

# Same pool and the same repository-scoped binding as the deploy account: the
# provider's attribute_condition is what keeps pull-request refs out, and it is
# unchanged. This adds an account that pool can reach, not a new way in.
resource "google_service_account_iam_member" "ship_wif" {
  count = var.enable_ship_identity ? 1 : 0

  service_account_id = google_service_account.ship[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_org}/${var.github_repo}"
}

# A custom role rather than roles/run.developer, which also carries
# run.instances.sshRoot: a shell in a running container reads every environment
# variable it has, including the database DSN. Deploying does not need that.
#
# Absent by design: services.create and services.delete (terraform's job), and
# any setIamPolicy, which would let this account grant itself the rest.
resource "google_project_iam_custom_role" "ship" {
  count = var.enable_ship_identity ? 1 : 0

  project     = var.project
  role_id     = "githubShip"
  title       = "GitHub Actions ship-only"
  description = "Roll a revision and run a job. No shell, no IAM, no create or delete."

  permissions = [
    "resourcemanager.projects.get",
    "run.services.get",
    "run.services.list",
    "run.services.update",
    "run.revisions.get",
    "run.revisions.list",
    "run.operations.get",
    "run.jobs.get",
    "run.jobs.list",
    "run.jobs.run",
    "run.executions.get",
    "run.executions.list",
    "run.tasks.get",
    "run.tasks.list",
  ]
}

resource "google_project_iam_member" "ship" {
  count = var.enable_ship_identity ? 1 : 0

  project = var.project
  role    = google_project_iam_custom_role.ship[0].name
  member  = "serviceAccount:${google_service_account.ship[0].email}"
}

# Updating a service that runs *as* another identity requires impersonating it,
# so this is per runtime account rather than a project-wide grant.
resource "google_service_account_iam_member" "ship_runtime" {
  for_each = var.enable_ship_identity ? toset(var.runtime_service_accounts) : toset([])

  service_account_id = "projects/${var.project}/serviceAccounts/${each.value}"
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.ship[0].email}"
}

# The migration job connects through the Cloud SQL Auth Proxy, which needs this
# and nothing more. Not cloudsql.admin, which can also delete the instance.
resource "google_project_iam_member" "ship_cloudsql" {
  count = var.enable_ship_identity ? 1 : 0

  project = var.project
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.ship[0].email}"
}

# Artifact Registry on the repository rather than the project: a project-wide
# grant would also cover any repository added later, holding anything.
resource "google_artifact_registry_repository_iam_member" "ship" {
  count = var.enable_ship_identity && var.artifact_registry_repository != "" ? 1 : 0

  project    = var.project
  location   = var.region
  repository = var.artifact_registry_repository
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.ship[0].email}"
}

# One secret, by name. The migration job reads the database URL and nothing
# else, which is the whole difference from the secretmanager.admin it holds
# today: that also covers the OAuth client secrets and every signing key, and
# carries setIamPolicy on all of them.
resource "google_secret_manager_secret_iam_member" "ship_database_url" {
  for_each = var.enable_ship_identity ? toset(var.ship_readable_secrets) : toset([])

  project   = var.project
  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.ship[0].email}"
}
