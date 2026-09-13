variable "project" {
  type    = string
  default = "platform-prod-495017"
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

# buildOS ID serves this estate's identity, and is deployed from its own repo.
# The identity estate is a sibling of this one, so it is an input here rather
# than something this stack computes from `domain`.
variable "identity_domain" {
  type        = string
  description = "Base domain of the identity estate (aec-craft/platform-id)."
  default     = "id.os.build"
}

# The docs portal's own OAuth client, registered in the identity console like
# any other. A public client id is not a secret, so it sits here rather than in
# Secret Manager. Empty renders the portal with no client to authorize as, which
# is where this environment stays until one is registered there.
variable "docs_oidc_client_id" {
  type        = string
  description = "OAuth client id the API docs portal authorizes as."
  default     = ""
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
  description = "Provision graph-db Secret Manager entries + VPC connector + mount them on platform-api. Requires graph_db_uri/username/password to be set."
  default     = false
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

# Keto has no hostname: it is the one identity service off that estate's load
# balancer, so it is addressed by its generated Cloud Run URL, which cannot be
# derived: the host carries a hash that is per project and not knowable before
# the service exists. Read it off the deployed service:
#
#   gcloud run services describe keto-read-<env> --project <identity project> \
#     --region europe-west3 --format='value(status.url)'
#
# Guessing the <service>-<project-number>.<region> form was wrong for test, and
# wrong in the way that costs most: the API boots, /health passes, and every
# authorized request is refused. Empty is refused at boot by requireEnv instead,
# which is the failure worth having.
variable "keto_read_url" {
  type        = string
  description = "Keto read API (check/expand). Empty leaves the API unable to authorize."
  default     = ""
}

variable "keto_write_url" {
  type        = string
  description = "Keto write API (relation tuples)."
  default     = ""
}

# The domain this estate is moving to, served beside `domain` during the
# cutover. Its zone lives in the shared stack and is delegated from os.build.
variable "additional_domain" {
  type        = string
  description = "Domain being introduced. Names under it serve on a second certificate."
  default     = "platform.os.build"
}

# ── File storage ─────────────────────────────────────────────────────────────
# The bucket the files module signs upload and download URLs against. Off leaves
# folder operations working and every byte operation answering 503, which is a
# deployment that accepts a file and cannot store it.
variable "file_storage_enabled" {
  type        = bool
  description = "Provision the platform files GCS bucket and grant the API service account access."
  default     = true
}

# ── Document index ───────────────────────────────────────────────────────────
# See dev/variables.tf for what these switch on and the order they have to be
# set in. Off until this environment has a Pinecone index of its own: turning it
# on without `pinecone_index_host` gives a deployment that answers the index
# routes and addresses nothing.
variable "document_index_enabled" {
  type        = bool
  description = "Mount the Pinecone key and the Vertex settings on platform-api so the ingest worker has somewhere to write."
  default     = false
}

variable "pinecone_index_host" {
  type        = string
  description = "Data-plane host of the dense index, e.g. docs-abc123.svc.aped-4627-b74a.pinecone.io."
  default     = ""
}

variable "rag_dimensions" {
  type        = number
  description = "Embedding dimensionality, which must equal the dimension the Pinecone index was created with."
  default     = 768
}

# OCR reads what a text layer cannot. Mistral's model as Vertex Model Garden
# publishes it: no key, the pages processed in the region below, and the usage on
# the Google Cloud invoice. Figure captions ride along on Vertex too.
variable "document_ocr_enabled" {
  type        = bool
  description = "Run OCR over uploaded documents. Requires document_index_enabled."
  default     = false
}

variable "vertex_ocr_location" {
  type        = string
  description = "Model Garden region serving Mistral OCR. europe-west4 keeps processing in the EU; us-central1 is the only other one that answers."
  default     = "europe-west4"
}
