resource "google_project_service" "apis" {
  for_each = toset([
    # cloudresourcemanager is required for `google_project_service` itself to
    # manage other APIs — keep first / never remove. Must be enabled OOB
    # before the very first apply (chicken-and-egg).
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "run.googleapis.com",
    "compute.googleapis.com",
    # Wildcard certificates with DNS authorization (load-balancer module).
    "certificatemanager.googleapis.com",
    "vpcaccess.googleapis.com",
    "sqladmin.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudbuild.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    # Vertex AI: embeddings, grounded answers, figure captions.
    "aiplatform.googleapis.com",
    "sts.googleapis.com",
  ])

  project = var.project
  service = each.value

  disable_dependent_services = false
  disable_on_destroy         = false
}
