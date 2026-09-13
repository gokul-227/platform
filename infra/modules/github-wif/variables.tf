variable "project" {
  type = string
}

variable "github_org" {
  type = string
}

variable "github_repo" {
  type = string
}

variable "allowed_refs" {
  type        = list(string)
  description = "Git refs allowed to assume the deploy service account through GitHub OIDC."
  default     = ["refs/heads/main"]
}

# Empty by default, so an environment reached only from a branch stays reached
# only from that branch. An environment deployed by tag needs "refs/tags/v",
# because the deploy is triggered by a tag push and the token it presents carries
# that ref: without it the run fails inside `auth` with a permission error that
# names nothing about tags.
variable "allowed_ref_prefixes" {
  type        = list(string)
  description = "Ref prefixes allowed to assume the deploy service account, for refs that cannot be enumerated."
  default     = []
}

# ── Read-only plan identity ──────────────────────────────────────────────────
# A second, separate WIF pool + service account that PR-event refs federate to,
# so `terraform plan` can run on pull_request without ever being able to reach
# the full-admin deploy SA. The deploy pool/SA above are untouched: PR tokens
# are only ever valid in the plan pool, whose binding lives on a different
# principalSet, so they physically cannot impersonate the deploy identity.
variable "enable_plan_identity" {
  type        = bool
  description = "Provision the read-only github-plan WIF pool + service account for plan-on-PR. Off by default; enabled per-env as the plan workflow is rolled out."
  default     = false
}

variable "plan_roles" {
  type        = list(string)
  description = "Project-level read roles for the plan SA. EMPTY by default on purpose: dev's config has no data sources and the PR plan runs with -refresh=false, so the only access it needs is reading remote state — granted out-of-band as bucket-scoped storage.objectViewer on the tfstate bucket (see docs/operations.md), not project-wide. Withholding roles/viewer keeps a tampered PR from using this identity to read other buckets (e.g. file storage) or enumerate the whole project. Add a single narrow read role here only if a data source later needs it; never roles/viewer or project-wide storage."
  default     = []
}

variable "deploy_roles" {
  type = list(string)
  # Curated set so `terraform apply` in CI can manage the full infra graph
  # (Cloud Run, LB + Cloud Armor, Cloud SQL, Secret Manager, WIF, API
  # enablement, project-level IAM bindings). The SA is only assumable from
  # this repo's allowed refs via WIF — it functions as the project's CI
  # admin identity. Editor-equivalent in scope, expressed as specific roles
  # rather than the legacy `roles/editor` umbrella.
  default = [
    "roles/run.admin",
    "roles/artifactregistry.admin",
    "roles/cloudsql.admin",
    "roles/secretmanager.admin",
    "roles/compute.admin",
    "roles/vpcaccess.admin",
    "roles/iam.serviceAccountUser",
    "roles/iam.serviceAccountAdmin",
    "roles/iam.workloadIdentityPoolAdmin",
    "roles/resourcemanager.projectIamAdmin",
    "roles/serviceusage.serviceUsageAdmin",
    # GCS buckets: the files module creates a per-env bucket
    # and sets bucket-level IAM. buckets.create + setIamPolicy live in
    # storage.admin; the narrower object/viewer roles don't include them.
    "roles/storage.admin",
    # Wildcard certificates: the load-balancer module owns DNS authorizations,
    # certificates, a map and its entries. Without this a plan does not merely
    # fail to change them, it fails to read them, so the whole environment
    # becomes unplannable the moment one exists. Editor rather than owner, which
    # only adds setIamPolicy on these resources.
    "roles/certificatemanager.editor",
    # Custom role definitions, which this module now owns one of (the ship
    # role). projectIamAdmin above is a different permission: it grants a role
    # to a member, and says nothing about creating or reading the role itself.
    #
    # Same failure as the certificates above, and the reason it is worth
    # spelling out twice: the refusal is on the read, so an environment stops
    # being plannable at all the moment one of these exists, whether or not
    # anything about it changed. Nothing here narrows by leaving it out; the
    # estate simply becomes unmanageable from CI.
    "roles/iam.roleAdmin",
  ]
}

# The ship-only identity. Off by default so an environment adopts it
# deliberately, and additive while off: enabling it creates an account and
# changes nothing about the one deploys use today.
variable "enable_ship_identity" {
  type        = bool
  description = "Provision the minimal ship-only CI identity beside the broad deploy one."
  default     = false
}

variable "runtime_service_accounts" {
  type        = list(string)
  description = "Runtime service account emails the ship identity may act as. One entry per Cloud Run service it rolls."
  default     = []
}

variable "artifact_registry_repository" {
  type        = string
  description = "Artifact Registry repository the ship identity may push to. Empty grants no push."
  default     = ""
}

variable "region" {
  type        = string
  description = "Region of the Artifact Registry repository above."
  default     = ""
}

# Named rather than pattern-matched: a prefix would silently widen the moment
# somebody adds a secret whose name happens to start with it.
variable "ship_readable_secrets" {
  type        = list(string)
  description = "Secret ids the ship identity may read. The migration job's database URL, and nothing else."
  default     = []
}
