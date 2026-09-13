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
      PUBLIC_URL   = "https://${local.api_host}"

      # See dev/service.platform-api.tf for what these are and how they fail when
      # wrong: both are optional with localhost defaults in the package, so a
      # missing one yields a service that answers 401 to every gated route while
      # its health check stays green. The audience is PUBLIC_URL.
      OIDC_ISSUER = "https://${local.oauth_host}"

      # No docs client registered for this environment yet. Empty renders the
      # portal without a prefilled client, which is the honest state.
      DOCS_OIDC_CLIENT_ID = var.docs_oidc_client_id

      KETO_READ_URL        = var.keto_read_url
      KETO_WRITE_URL       = var.keto_write_url
      KETO_IDENTITY_TOKENS = "true"
      # See dev/service.platform-api.tf for why this is open.
      CORS_ORIGINS = "*"
    },
    # Graph projection. No-op until graph_db_enabled. See
    # graph-database.tf.
    var.graph_db_enabled ? { GRAPH_DB_ENGINE = "memgraph" } : {},
    # File storage. Bucket name only; the SA signs URLs with its own
    # identity (no key). No-op until file_storage_enabled. See file-storage.tf.
    var.file_storage_enabled ? { FILE_STORAGE_BUCKET = google_storage_bucket.files[0].name } : {},
    # Document index. The Pinecone key rides in `secrets`; these are the index it
    # addresses and the Vertex settings the embedder needs. VERTEX_LOCATION is a
    # region because the embedder calls a regional endpoint. See document-index.tf.
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
      # The name the API reads; see dev/service.platform-api.tf.
      IDENTITY_WEBHOOK_SECRET = google_secret_manager_secret.auth_webhook_secret.secret_id
    },
    var.graph_db_enabled ? {
      GRAPH_DB_URI      = google_secret_manager_secret.graph_db["graph-db-uri"].secret_id
      GRAPH_DB_USERNAME = google_secret_manager_secret.graph_db["graph-db-username"].secret_id
      GRAPH_DB_PASSWORD = google_secret_manager_secret.graph_db["graph-db-password"].secret_id
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
  min_instances       = 1
  max_instances       = 20

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
