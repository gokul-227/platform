# Graph projection database wiring.
#
# platform-api's in-process graph sync worker projects the LOCUS graph into a
# dedicated graph DB, and POST /graph/query reads from it. This file wires the
# *connection* — Secret Manager entries + IAM for the platform-api runtime SA;
# the Cloud Run mounts live in service.platform-api.tf.
#
# Engine: Memgraph, self-hosted on Compute Engine. Per the official GCP guide
# there is no Marketplace image — you run a standard CE VM with the Docker
# container:
#   docs:  https://memgraph.com/docs/deployment   (and .../environments/gcp)
#   image: memgraph/memgraph-mage  (the -mage variant ships the MAGE
#          algorithm modules our queries use: wShortest / BFS /
#          weakly_connected_components)
#   run:   docker run -p 7687:7687 memgraph/memgraph-mage   (bolt on 7687)
#   disk:  persistent SSD, ~2x the stored data; RAM ~2x storage (in-memory)
# BSL-licensed (free), and the SAME engine we run in local dev
# (compose.graph.yaml), so the projection Cypher + algorithm dialect need zero
# changes between dev and deployed. The projection is disposable (rebuildable
# from graph_version), so one un-replicated VM is fine — if it dies, the
# worker re-projects from seq 0.
#
# Swap target at scale: if the single shared graph DB (it holds EVERY
# org/project per env) outgrows an in-memory engine's RAM, swap to disk-based
# Neo4j Enterprise on Compute Engine — "the correct way to deploy Neo4j on
# GCP" — without touching the sync code (only the algorithm dialect differs):
#   docs:   https://neo4j.com/docs/operations-manual/current/cloud-deployments/neo4j-gcp/
#   module: github.com/neo4j-partners/gcp-tf-neo4j
#   image:  projects/neo4j-mp-public/global/images/neo4j-enterprise-edition
# At that point flip GRAPH_DB_ENGINE to "neo4j" (service.platform-api.tf).
#
# Why the VM itself is NOT provisioned in this file: standing up the Memgraph
# VM is a separate apply (it must be `terraform plan`-tested against GCP, not
# shipped blind). Everything AROUND the VM is here and gated: the Secret
# Manager entries + Cloud Run mounts below, and the VPC Access connector (with
# the cloud-run module's vpc_access egress) so Cloud Run can reach the VM's
# internal bolt://. Once the VM exists, set graph_db_uri (bolt://<vm-ip>:7687)
# / username / password and flip graph_db_enabled.
#
# Gated on `graph_db_enabled`: false (default) creates nothing, so existing
# environments plan clean and platform-api runs with graph features dormant
# (sync worker idle, POST /graph/query -> 503).

locals {
  # name -> value map; empty when disabled so every resource below no-ops.
  graph_db_secrets = var.graph_db_enabled ? {
    "graph-db-uri"      = var.graph_db_uri
    "graph-db-username" = var.graph_db_username
    "graph-db-password" = var.graph_db_password
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
# graph-DB VM's internal bolt://10.x. The graph VM's firewall must allow this
# connector's /28 on 7687 (set the VM's bolt_source_ranges to include it when
# provisioning the VM). Requires vpcaccess.googleapis.com enabled
# (add to apis.tf or enable on first apply). The /28 must not overlap existing
# subnets — 10.8.0.0/28 sits outside the default VPC's auto subnets (10.128/9).
resource "google_vpc_access_connector" "graph" {
  count         = var.graph_db_enabled ? 1 : 0
  name          = "graph-db-connector"
  project       = var.project
  region        = var.region
  network       = "default"
  ip_cidr_range = "10.8.0.0/28"
}
