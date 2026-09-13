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

variable "database_name" {
  type    = string
  default = "platform"
}

variable "user_name" {
  type    = string
  default = "platform"
}

variable "tier" {
  type    = string
  default = "db-f1-micro"
}

variable "disk_size" {
  type    = number
  default = 10
}

variable "availability_type" {
  type    = string
  default = "ZONAL"
}

variable "backup_enabled" {
  type    = bool
  default = true
}

variable "backup_retention_count" {
  type    = number
  default = 7
}

variable "deletion_protection" {
  type    = bool
  default = true
}

variable "max_connections" {
  type    = number
  default = 100
}

variable "private_network" {
  type    = string
  default = null
}
