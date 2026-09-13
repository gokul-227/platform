# File storage for the files module. A per-env GCS bucket the
# platform-api service account signs upload/download URLs against. Gated by
# `file_storage_enabled` so the resource only exists where files are turned on;
# when off, the API's file routes degrade to 503 on byte operations.

resource "google_storage_bucket" "files" {
  count = var.file_storage_enabled ? 1 : 0

  name     = "${var.project}-platform-files-${local.env}"
  project  = var.project
  location = var.region

  uniform_bucket_level_access = true
  # Files are private; access is only ever via signed URLs minted by the API.
  public_access_prevention = "enforced"

  # Browsers upload/download straight to the bucket, so the preflight is
  # answered here, not by the API. Open, because CORS is not the boundary: the
  # bucket is private, every object is reached through a V4 signed URL the API
  # mints only for an authorized caller, and anyone holding that URL can already
  # use it outside a browser. An allowlist would only decide which page may read
  # a response it already holds the URL for, at the cost of a terraform change
  # per consumer and per Vercel preview origin.
  # x-goog-content-length-range rides on every signed PUT (the size bound is
  # pinned into the V4 signature); the preflight rejects it unless listed.
  # Content-Range/Range carry resumable chunking. Chunks still land without them
  # (the session URI accepts the write), but the client cannot read the committed
  # offset back off the 308, which is what pause/resume needs.
  cors {
    origin = ["*"]
    method = ["GET", "PUT", "HEAD"]
    response_header = [
      "Content-Type",
      "Content-Length",
      "Content-Range",
      "Range",
      "x-goog-content-length-range",
    ]
    max_age_seconds = 3600
  }

  # Backstop for bytes the API's upload sweeper could not reach (a cancel that
  # failed, a row deleted out from under a live session).
  lifecycle_rule {
    condition {
      age            = 7
      matches_prefix = []
    }
    action {
      type = "AbortIncompleteMultipartUpload"
    }
  }
}

# The service account needs object admin to sign read/write URLs and to delete
# objects on file/folder removal.
resource "google_storage_bucket_iam_member" "files_object_admin" {
  count = var.file_storage_enabled ? 1 : 0

  bucket = google_storage_bucket.files[0].name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.cloud_run_platform_api.email}"
}

# V4 signing with the SA's own identity (no exported key) needs the SA to be
# able to sign blobs as itself.
resource "google_service_account_iam_member" "files_token_creator" {
  count = var.file_storage_enabled ? 1 : 0

  service_account_id = google_service_account.cloud_run_platform_api.name
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = "serviceAccount:${google_service_account.cloud_run_platform_api.email}"
}
