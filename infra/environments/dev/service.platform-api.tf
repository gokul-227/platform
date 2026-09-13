module "platform_api" {
  source = "../../modules/cloud-run"

  project = var.project
  region  = var.region
  name    = "platform-api-${local.env}"
  port    = 3001

  ingress = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
  # IAM `allUsers/run.invoker` is required for the GCLB to forward requests
  # (Cloud Run still does the IAM check on LB-forwarded traffic). The
  # *.run.app URL stays blocked by ingress; auth/authz happens in-app.
  allow_public = true

  env_vars = merge(
    {
      NODE_ENV     = "production"
      ENV          = local.env
      SERVICE_NAME = "platform-api"
      LOG_LEVEL    = "info"
      PUBLIC_URL   = "https://api.${local.env}.${var.additional_domain}"

      # What this API trusts, and what the docs portal advertises. Both read the
      # same issuer, and the audience is PUBLIC_URL because a client names the
      # resource it wants a token for as an absolute URI (RFC 8707) and the
      # issuer stamps it into `aud`.
      #
      # All of these are optional in @aec-craft/platform-id-resource-nestjs and
      # default to localhost, so leaving one out does not fail a boot or a health
      # check: it produces a service that answers 401 to every gated route while
      # looking healthy. apps/api requires them instead.
      OIDC_ISSUER = "https://${local.oauth_host}"

      DOCS_OIDC_CLIENT_ID = var.docs_oidc_client_id

      # Authorization. Identity tokens on, because Keto is IAM-gated in a
      # deployed environment and unauthenticated on loopback locally, which is
      # the distinction apps/api/src/app.module.ts draws.
      KETO_READ_URL        = var.keto_read_url
      KETO_WRITE_URL       = var.keto_write_url
      KETO_IDENTITY_TOKENS = "true"
      # Open: browser callers authenticate by Authorization header, never by
      # cookie, so an origin cannot borrow a credential. Session auth, or any
      # route that trusts a request header for identity, turns this back into an
      # allowlist. See apps/api/src/cors.ts.
      CORS_ORIGINS = "*"
    },
    # Graph projection. The connection rides in `secrets`; this just
    # selects the engine dialect. No-op until graph_db_enabled. See
    # graph-database.tf.
    var.graph_db_enabled ? { GRAPH_DB_ENGINE = "memgraph" } : {},
    # File storage. Bucket name only; the SA signs URLs with its own
    # identity (no key). No-op until file_storage_enabled. See file-storage.tf.
    var.file_storage_enabled ? { FILE_STORAGE_BUCKET = google_storage_bucket.files[0].name } : {},
    # Document index. The Pinecone key rides in `secrets`; these are the index it
    # addresses and the Vertex settings the embedder needs. VERTEX_LOCATION is a
    # region because the embedder calls a regional endpoint; the answerer and the
    # captioner use the global one and take no setting. See document-index.tf.
    var.document_index_enabled ? {
      PINECONE_INDEX_HOST = var.pinecone_index_host
      VERTEX_PROJECT_ID   = var.project
      VERTEX_LOCATION     = var.region
      RAG_DIMENSIONS      = tostring(var.rag_dimensions)
    } : {},
    # OCR through Vertex Model Garden: no key, the runtime identity is the
    # credential, and the region decides where pages are processed. Model Garden
    # serves this model in few regions, none of them var.region.
    var.document_index_enabled && var.document_ocr_enabled ? {
      VERTEX_OCR_LOCATION = var.vertex_ocr_location
    } : {}
  )

  secrets = merge(
    {
      DATABASE_URL = module.database.db_url_secret_id
      # The name the API reads. It was AUTH_WEBHOOK_SECRET, from better auth,
      # and apps/api has read IDENTITY_WEBHOOK_SECRET since the identity estate
      # replaced it, so the guard saw nothing and refused every hook.
      IDENTITY_WEBHOOK_SECRET = google_secret_manager_secret.auth_webhook_secret.secret_id
    },
    # Dev Memgraph is authless (internal-only, firewall-locked), so only the
    # bolt URI is mounted. Add username/password here when prod enables auth.
    var.graph_db_enabled ? {
      GRAPH_DB_URI = google_secret_manager_secret.graph_db["graph-db-uri"].secret_id
    } : {},
    var.document_index_enabled ? {
      PINECONE_API_KEY = google_secret_manager_secret.pinecone_api_key.secret_id
    } : {}
  )


  # Reach the graph-DB VM over the VPC when graph is enabled (see graph-database.tf).
  vpc_connector = var.graph_db_enabled ? google_vpc_access_connector.graph[0].id : null

  cloudsql_connection = module.database.connection_name
  service_account     = google_service_account.cloud_run_platform_api.email
  health_path         = "/health"
  # The module ties CPU-when-idle to this, and the ingest worker polls
  # in-process: at 0 the container is throttled between requests, so a document
  # already uploaded waits for unrelated traffic to be indexed.
  min_instances = 1
  max_instances = 5

  depends_on = [
    google_project_service.apis,
    google_project_iam_member.cloud_run_platform_api_roles,
    google_secret_manager_secret_iam_member.db_url_platform_api,
    google_secret_manager_secret_iam_member.auth_webhook_secret_platform_api,
    google_secret_manager_secret_iam_member.graph_db_platform_api,
    google_secret_manager_secret_iam_member.pinecone_api_key_platform_api,
    google_vpc_access_connector.graph,
  ]
}

output "platform_api_url" {
  value = module.platform_api.url
}
