variable "project" {
  type = string
}

variable "name" {
  type    = string
  default = "memgraph"
}

variable "zone" {
  type    = string
  default = "europe-west3-a"
}

variable "network" {
  type    = string
  default = "default"
}

variable "subnetwork" {
  type    = string
  default = null
}

variable "machine_type" {
  type    = string
  default = "e2-standard-2"
}

variable "boot_disk_size" {
  type        = number
  description = "Boot disk GB (OS + Docker image). The graph lives in RAM (machine_type) + the data disk."
  default     = 20
}

variable "data_disk_size" {
  type        = number
  description = "Persistent data disk GB for Memgraph snapshots + WAL. Rule of thumb ~2x the on-RAM graph size."
  default     = 20
}

variable "memgraph_image" {
  type    = string
  default = "memgraph/memgraph-mage:latest"
}

variable "bolt_source_ranges" {
  type        = list(string)
  description = "CIDRs allowed to reach bolt 7687. VPC connector range in prod, or your workstation /32 for an ad-hoc test. Never 0.0.0.0/0."
}

variable "assign_external_ip" {
  type        = bool
  description = "Give the VM a public IP (ad-hoc testing only; pair with a /32 source range)."
  default     = false
}
