# Graph projection database — dev provisions the real VM.
#
# When graph_db_enabled (true for dev), this:
#   1. stands up the Memgraph VM (memgraph-gce module: durable, internal-only),
#   2. opens its bolt firewall ONLY to the VPC connector's range,
#   3. publishes bolt://<vm-internal-ip>:7687 into Secret Manager,
#   4. provisions the Serverless VPC Access connector so the Cloud Run
#      platform-api can reach the VM's internal bolt over the VPC.
# The Cloud Run mounts + GRAPH_DB_ENGINE live in service.platform-api.tf.
#
# Auth: dev runs Memgraph AUTHLESS — the VM has no external IP and the firewall
# only admits the connector range, so the network is the boundary. Add auth +
# username/password secrets before prod. The projection is current-state-only
# and now durable (snapshots+WAL on a persistent disk), so a restart reopens
# rather than replays; graph_version replay stays the first-seed / DR path.

module "memgraph" {
  count  = var.graph_db_enabled ? 1 : 0
  source = "../../modules/memgraph-gce"

  project      = var.project
  name         = "graph-db"
  zone         = "${var.region}-a"
  machine_type = "e2-small"
  # Internal only; reachable solely from the VPC connector range.
  assign_external_ip = false
  bolt_source_ranges = [google_vpc_access_connector.graph[0].ip_cidr_range]

  # NAT must exist first so the boot-time startup script can apt + docker pull.
  depends_on = [google_project_service.apis, google_compute_router_nat.graph]
}

# The Memgraph VM has no external IP (internal-only), so it needs Cloud NAT to
# reach the internet at boot (apt + `docker pull memgraph-mage`). Egress only;
# ingress stays controlled by the bolt firewall.
resource "google_compute_router" "graph" {
  count   = var.graph_db_enabled ? 1 : 0
  name    = "graph-db-router"
  project = var.project
  region  = var.region
  network = "default"
}

resource "google_compute_router_nat" "graph" {
  count                              = var.graph_db_enabled ? 1 : 0
  name                               = "graph-db-nat"
  project                            = var.project
  region                             = var.region
  router                             = google_compute_router.graph[0].name
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}

locals {
  # Only the bolt URI is wired (authless). It's derived from the VM, not a var.
  graph_db_secrets = var.graph_db_enabled ? {
    "graph-db-uri" = "bolt://${module.memgraph[0].internal_ip}:7687"
  } : {}
}

resource "google_secret_manager_secret" "graph_db" {
  for_each  = local.graph_db_secrets
  secret_id = each.key
  project   = var.project

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret_version" "graph_db" {
  for_each    = local.graph_db_secrets
  secret      = google_secret_manager_secret.graph_db[each.key].id
  secret_data = each.value
}

resource "google_secret_manager_secret_iam_member" "graph_db_platform_api" {
  for_each  = local.graph_db_secrets
  project   = var.project
  secret_id = google_secret_manager_secret.graph_db[each.key].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.cloud_run_platform_api.email}"
}

# Serverless VPC Access connector so Cloud Run (platform-api) can reach the
# graph-DB VM's internal bolt://10.x. Its /28 must not overlap existing subnets
# — 10.8.0.0/28 sits outside the default VPC's auto subnets (10.128/9).
resource "google_vpc_access_connector" "graph" {
  count         = var.graph_db_enabled ? 1 : 0
  name          = "graph-db-connector"
  project       = var.project
  region        = var.region
  network       = "default"
  ip_cidr_range = "10.8.0.0/28"

  depends_on = [google_project_service.apis]
}
