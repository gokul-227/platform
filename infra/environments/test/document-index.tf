# The document index. Pinecone holds the vectors, Vertex embeds and answers, and
# Mistral OCR reads what a PDF's text layer cannot. See
# dev/document-index.tf for the bootstrap order: container, then value, then
# mount. Vertex is keyless on the platform-api service identity.

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

# Vertex AI (Gemini) for embeddings, grounded answers and figure captions.
# platform-api only: no other runtime calls models.
resource "google_project_iam_member" "cloud_run_platform_api_vertex" {
  project = var.project
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.cloud_run_platform_api.email}"
}
