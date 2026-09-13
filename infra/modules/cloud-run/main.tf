resource "google_cloud_run_v2_service" "this" {
  name     = var.name
  location = var.region
  project  = var.project

  ingress = var.ingress

  template {
    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    max_instance_request_concurrency = var.concurrency
    timeout                          = "${var.timeout_seconds}s"
    service_account                  = var.service_account

    containers {
      image = var.image

      ports {
        container_port = var.port
      }

      resources {
        limits = {
          memory = var.memory
          cpu    = var.cpu
        }
        cpu_idle          = var.min_instances == 0
        startup_cpu_boost = var.cpu_boost
      }

      dynamic "env" {
        for_each = var.env_vars
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secrets
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      dynamic "startup_probe" {
        for_each = var.health_path != null ? [1] : []
        content {
          http_get {
            path = var.health_path
            port = var.port
          }
          initial_delay_seconds = 5
          period_seconds        = 10
          failure_threshold     = 6
        }
      }

      dynamic "liveness_probe" {
        for_each = var.health_path != null ? [1] : []
        content {
          http_get {
            path = var.health_path
            port = var.port
          }
          period_seconds    = 30
          failure_threshold = 3
        }
      }

      # Cloud SQL Auth Proxy socket dir. GCP auto-attaches this when a
      # `cloud_sql_instance` volume is present, but if we don't declare it
      # here too, every `terraform plan` shows a phantom removal of the mount.
      dynamic "volume_mounts" {
        for_each = var.cloudsql_connection != null ? [1] : []
        content {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }
    }

    dynamic "volumes" {
      for_each = var.cloudsql_connection != null ? [1] : []
      content {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [var.cloudsql_connection]
        }
      }
    }

    # Serverless VPC Access: routes the service's private-range egress through
    # the connector into the VPC, so it can reach internal IPs (e.g. the
    # graph-DB VM's bolt://10.x). Public egress is unaffected. Null = no VPC
    # egress (the default for services that don't need it).
    dynamic "vpc_access" {
      for_each = var.vpc_connector != null ? [1] : []
      content {
        connector = var.vpc_connector
        egress    = "PRIVATE_RANGES_ONLY"
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  # CI (`.github/workflows/deploy.yml`) rolls new revisions with a SHA-tagged
  # image via `gcloud run deploy`. Terraform owns the service shape (env vars,
  # secrets, scaling, ingress, probes) but not the deployed revision's image,
  # otherwise every `terraform apply` would revert the running revision to
  # whatever `:latest` currently points at and race CI.
  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
    ]
  }
}

resource "google_cloud_run_v2_service_iam_member" "public" {
  count    = var.allow_public ? 1 : 0
  project  = var.project
  location = var.region
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
