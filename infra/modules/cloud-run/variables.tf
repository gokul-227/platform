variable "project" {
  type = string
}

variable "region" {
  type    = string
  default = "europe-west3"
}

variable "name" {
  type = string
}

variable "image" {
  type = string
  # Placeholder so first-time creation succeeds before deploy.yml
  # pushes the real image. lifecycle.ignore_changes (see main.tf) makes
  # subsequent applies leave whatever gcloud last rolled in untouched.
  default = "gcr.io/cloudrun/hello"
}

variable "port" {
  type    = number
  default = 8080
}

variable "memory" {
  type    = string
  default = "512Mi"
}

variable "cpu" {
  type    = string
  default = "1"
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 5
}

variable "concurrency" {
  type    = number
  default = 80
}

variable "timeout_seconds" {
  type    = number
  default = 60
}

variable "cpu_boost" {
  type    = bool
  default = true
}

variable "ingress" {
  type    = string
  default = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
}

variable "env_vars" {
  type    = map(string)
  default = {}
}

variable "secrets" {
  type    = map(string)
  default = {}
}

variable "cloudsql_connection" {
  type    = string
  default = null
}

variable "vpc_connector" {
  type        = string
  description = "Serverless VPC Access connector id for VPC egress (e.g. reach the graph-DB VM's internal bolt). Null = no VPC egress."
  default     = null
}

variable "allow_public" {
  type    = bool
  default = false
}

variable "service_account" {
  type    = string
  default = null
}

variable "health_path" {
  type    = string
  default = "/health"
}
