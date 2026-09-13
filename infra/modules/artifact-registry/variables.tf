variable "project" {
  type = string
}

variable "region" {
  type    = string
  default = "europe-west3"
}

variable "name" {
  type    = string
  default = "platform"
}

variable "keep_recent_count" {
  type    = number
  default = 10
}

variable "untagged_retention_days" {
  type    = number
  default = 7
}
