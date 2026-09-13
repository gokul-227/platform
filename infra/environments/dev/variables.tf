variable "project" {
  type    = string
  default = "platform-dev-495017"
}

variable "region" {
  type    = string
  default = "europe-west3"
}

variable "github_org" {
  type    = string
  default = "aec-craft"
}

variable "github_repo" {
  type    = string
  default = "platform"
}

variable "domain" {
  type    = string
  default = "platform.sparc.build"
}


# ── Graph projection database ────────────────────────────────────────────────
# The platform-api graph sync worker + /graph/query read from a dedicated
# graph DB (Memgraph on a Compute Engine VM). When `graph_db_enabled` is false
# (default), none of the graph wiring is created and platform-api runs with the
# graph features dormant (sync worker idle, POST /graph/query -> 503). Flip to
# true AND set the three connection values (after the Memgraph VM exists, see
# once provisioned) to wire it through Secret Manager into the Cloud Run service.
variable "graph_db_enabled" {
  type        = bool
  description = "Provision the Memgraph VM + VPC connector + Secret Manager wiring and mount it on platform-api. Enabled for dev."
  default     = true
}

variable "graph_db_uri" {
  type        = string
  description = "Bolt URI of the graph DB, e.g. bolt://<vm-internal-ip>:7687 (Memgraph). Sourced from the graph DB VM."
  default     = ""
  sensitive   = true
}

variable "graph_db_username" {
  type        = string
  description = "Graph DB username (Memgraph: as configured on the VM)."
  default     = ""
  sensitive   = true
}

variable "graph_db_password" {
  type        = string
  description = "Graph DB password, as configured on the VM."
  default     = ""
  sensitive   = true
}

# File storage (GCS bucket for the files module). When false, the
# bucket isn't created and the API's file byte-ops degrade to 503.
variable "file_storage_enabled" {
  type        = bool
  description = "Provision the platform files GCS bucket and grant the API service account access. Enabled for dev."
  default     = true
}

# buildOS ID's domain, from which the issuer hostname derives. The identity
# estate is a sibling of this one, so it is an input here rather than something
# this stack computes from `domain`.
variable "identity_domain" {
  type        = string
  description = "Base domain of the identity estate (aec-craft/platform-id)."
  default     = "id.os.build"
}

# The docs portal's own OAuth client, registered in the identity console like
# any other. A public client id is not a secret, so it sits here rather than in
# Secret Manager. Empty renders the portal with no client to authorize as.
variable "docs_oidc_client_id" {
  type        = string
  description = "OAuth client id the API docs portal authorizes as."
  default     = "ce3aef79-3e35-4ba6-8abd-a4eb028df7b1"
}

# Keto is the one identity service with no hostname: it is the only one not on
# that estate's load balancer, so it is addressed by its generated Cloud Run URL
# and cannot be derived. A run.app URL survives a revision but not a service
# being recreated, which is the argument for giving Keto a name like every other
# service has; until then these are variables rather than a computed string.
variable "keto_read_url" {
  type        = string
  description = "Keto read API (check/expand). Empty leaves the API unable to authorize."
  default     = "https://keto-read-dev-4xd6ndv3fq-ey.a.run.app"
}

variable "keto_write_url" {
  type        = string
  description = "Keto write API (relation tuples)."
  default     = "https://keto-write-dev-4xd6ndv3fq-ey.a.run.app"
}

# The domain this estate is moving to, served beside `domain` during the
# cutover. Its zone lives in the shared stack and is delegated from os.build.
variable "additional_domain" {
  type        = string
  description = "Domain being introduced. Names under it serve on a second certificate."
  default     = "platform.os.build"
}

# ── Document index ───────────────────────────────────────────────────────────
# Uploads under the `document` preset become searchable by meaning and by term,
# and the chat can cite them. Off leaves documents stored and downloadable with
# every index route answering 503, which is the state an environment is in until
# a Pinecone index exists for it.
#
# Enable only once `pinecone-api-key` holds a version (Sync secrets) and
# `pinecone_index_host` names an index of `rag_dimensions` dimensions: a
# revision that mounts a versionless secret never starts, and a dimension
# mismatch is refused per request rather than at boot.
#
# The lexical half is Postgres full-text search over the chunk table the API
# already owns, which needs no configuration and keeps both halves of a hybrid
# query on one authorization predicate.
variable "document_index_enabled" {
  type        = bool
  description = "Mount the Pinecone key and the Vertex settings on platform-api, and keep one instance warm so the ingest worker runs."
  default     = true
}

variable "pinecone_index_host" {
  type        = string
  description = "Data-plane host of the dense index. 768 dimensions, cosine, serverless on GCP europe-west4."
  default     = "https://platform-files-api-g1hud67.svc.gcp-europe-west4-de1d.pinecone.io"
}

variable "rag_dimensions" {
  type        = number
  description = "Embedding dimensionality, which must equal the dimension the Pinecone index was created with."
  default     = 768
}

# OCR reaches scanned PDFs, DOCX, PPTX and images, gives every PDF structured
# markdown, and is what makes the `document` preset admit those extra types. It
# runs on Mistral's model as Vertex Model Garden publishes it: no key, the pages
# processed in the region below, and the usage on the Google Cloud invoice.
# Figure captions ride along on Vertex, one model call per extracted image.
variable "document_ocr_enabled" {
  type        = bool
  description = "Run OCR over uploaded documents. Requires document_index_enabled."
  default     = true
}

variable "vertex_ocr_location" {
  type        = string
  description = "Model Garden region serving Mistral OCR. europe-west4 keeps processing in the EU; us-central1 is the only other one that answers."
  default     = "europe-west4"
}
