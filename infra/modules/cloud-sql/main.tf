resource "google_sql_database_instance" "this" {
  name                = var.name
  project             = var.project
  region              = var.region
  database_version    = "POSTGRES_17"
  deletion_protection = var.deletion_protection

  settings {
    # Stated, because the default for a new instance is no longer ENTERPRISE and
    # ENTERPRISE_PLUS refuses a db-custom-* tier outright: every tier here is a
    # custom one, so a new environment fails at instance creation with a message
    # about tiers that says nothing about editions. The existing instances are
    # already ENTERPRISE, so this is a no-op for them.
    edition           = "ENTERPRISE"
    tier              = var.tier
    disk_size         = var.disk_size
    disk_autoresize   = true
    availability_type = var.availability_type

    backup_configuration {
      enabled                        = var.backup_enabled
      point_in_time_recovery_enabled = var.backup_enabled
      start_time                     = "03:00"
      backup_retention_settings {
        retained_backups = var.backup_retention_count
        retention_unit   = "COUNT"
      }
    }

    ip_configuration {
      ipv4_enabled    = true
      ssl_mode        = "ENCRYPTED_ONLY"
      private_network = var.private_network
    }

    database_flags {
      name  = "max_connections"
      value = tostring(var.max_connections)
    }
    database_flags {
      name  = "log_min_duration_statement"
      value = "1000"
    }
    database_flags {
      name  = "log_connections"
      value = "on"
    }
    # IAM database authentication, which lets a principal connect as itself
    # instead of with the shared app password in `db-url`. Stated here rather
    # than left to whoever turns it on in the console: dev already had it, set by
    # hand and recorded nowhere, and `database_flags` is the authoritative list
    # the provider sends, so an undeclared flag is one apply away from being
    # removed by a change that has nothing to do with it.
    #
    # Static for Postgres, so enabling it restarts the instance. prod gets it at
    # creation and pays nothing.
    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }
  }
}

resource "google_sql_database" "this" {
  name     = var.database_name
  instance = google_sql_database_instance.this.name
  project  = var.project
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

resource "google_sql_user" "app" {
  name     = var.user_name
  instance = google_sql_database_instance.this.name
  project  = var.project
  password = random_password.db_password.result
}

resource "google_secret_manager_secret" "db_url" {
  secret_id = "db-url"
  project   = var.project

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_url" {
  secret = google_secret_manager_secret.db_url.id
  # `localhost` is a placeholder host required to keep the URL syntactically
  # valid for WHATWG parsers (Zod's `.url()`, Node's `new URL()`). pg ignores
  # it because the `host=` query param specifies the actual unix socket path.
  secret_data = "postgresql://${google_sql_user.app.name}:${random_password.db_password.result}@localhost/${var.database_name}?host=/cloudsql/${google_sql_database_instance.this.connection_name}"
}
