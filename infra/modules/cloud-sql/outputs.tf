output "connection_name" {
  value = google_sql_database_instance.this.connection_name
}

output "instance_name" {
  value = google_sql_database_instance.this.name
}

output "db_url_secret_id" {
  value = google_secret_manager_secret.db_url.secret_id
}

output "instance_id" {
  value = google_sql_database_instance.this.id
}
