output "repository_id" {
  value = google_artifact_registry_repository.this.repository_id
}

output "registry_path" {
  value = "${var.region}-docker.pkg.dev/${var.project}/${google_artifact_registry_repository.this.repository_id}"
}
