# Grants for the dev WIF service account to manage shared resources.
# The shared project has no WIF pool of its own — federation tokens are minted
# in the dev project, and the resulting `github-deploy@platform-dev-…` SA is
# granted the minimum roles on the shared project to apply this module via CI.
#
# Bootstrapping: terraform plan/apply always reads the IAM policy to refresh
# state, so the SA needs IAM-read permission *before* it can refresh these
# resources. `roles/resourcemanager.projectIamAdmin` covers read + manage, so
# the SA can also self-edit these bindings in future applies. First apply must
# be run with a human OrgAdmin's creds; subsequent applies work via CI.
locals {
  # Reuse the dev project's deploy SA. Hardcoded because dev is the bootstrap
  # WIF environment and we don't read its state from here.
  ci_member = "serviceAccount:github-deploy@platform-dev-495017.iam.gserviceaccount.com"
}

# IAM-read + self-manage. Required for terraform to refresh the bindings below.
resource "google_project_iam_member" "ci_iam_admin" {
  project = var.project
  role    = "roles/resourcemanager.projectIamAdmin"
  member  = local.ci_member
}

resource "google_project_iam_member" "ci_dns_admin" {
  project = var.project
  role    = "roles/dns.admin"
  member  = local.ci_member
}

resource "google_project_iam_member" "ci_service_usage_admin" {
  project = var.project
  role    = "roles/serviceusage.serviceUsageAdmin"
  member  = local.ci_member
}

# tfstate lives in platform-shared-495022-tfstate (see main.tf backend).
# `storage.admin` covers both object operations AND `storage.buckets.getIamPolicy`,
# which terraform refresh needs to read the bucket-level IAM binding below.
resource "google_storage_bucket_iam_member" "ci_tfstate" {
  bucket = "${var.project}-tfstate"
  role   = "roles/storage.admin"
  member = local.ci_member
}
