# The document index. Pinecone holds the vectors, Vertex embeds and answers, and
# Mistral OCR reads what a PDF's text layer cannot. Only the two vendor keys are
# secrets: Vertex is keyless on the platform-api service identity, which already
# holds roles/aiplatform.user (iam.tf).
#
# The containers exist whether or not the index is switched on, because a
# revision cannot mount a secret that has no version: Terraform creates them,
# the Sync secrets workflow writes the values, and `document_index_enabled`
# mounts them, in that order.

resource "google_secret_manager_secret" "pinecone_api_key" {
  secret_id = "pinecone-api-key"
  project   = var.project

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_iam_member" "pinecone_api_key_platform_api" {
  project   = var.project
  secret_id = google_secret_manager_secret.pinecone_api_key.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_platform_api.email}"
}

