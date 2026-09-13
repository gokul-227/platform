variable "project" {
  type    = string
  default = "platform-shared-495022"
}

variable "region" {
  type    = string
  default = "europe-west3"
}

variable "domain" {
  type    = string
  default = "platform.sparc.build"
}

variable "dev_lb_ip" {
  type        = string
  description = "Static IP of the dev environment's load balancer."
  default     = "34.49.218.49"
}

variable "test_lb_ip" {
  type        = string
  description = "Static IP of the test environment's load balancer."
  # Pinned (like dev_lb_ip) so the api.test/auth.test A-records aren't dropped by
  # a manual `shared` apply that forgets `-var test_lb_ip=...`. The shared env has
  # no CI apply path / tfvars, so an unset default silently destroys the
  # records, which is how test went unreachable. The real fix is a follow-up.
  default = "34.117.144.240"
}

variable "prod_lb_ip" {
  type        = string
  description = "Static IP of the prod environment's load balancer. Empty until provisioned."
  default     = ""
}