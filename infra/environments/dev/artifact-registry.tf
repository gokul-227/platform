module "registry" {
  source = "../../modules/artifact-registry"

  project = var.project
  region  = var.region

  depends_on = [google_project_service.apis]
}
