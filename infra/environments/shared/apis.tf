resource "google_project_service" "dns" {
  service            = "dns.googleapis.com"
  project            = var.project
  disable_on_destroy = false
}
