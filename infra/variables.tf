# --- OpenStack connection ---
# The application credential is tied to one project, so no project, user or domain is needed.

variable "openstack_auth_url" {
  description = "Keystone URL, OS_AUTH_URL in the RC file (e.g. https://api.example.org:5000)"
  type        = string
}

variable "openstack_region" {
  description = "Region, OS_REGION_NAME in the RC file"
  type        = string
}

variable "openstack_application_credential_id" {
  description = "ID shown when the application credential is created"
  type        = string
}

variable "openstack_application_credential_secret" {
  description = "Secret shown once when the application credential is created. Set with: export TF_VAR_openstack_application_credential_secret='...'"
  type        = string
  sensitive   = true
}

# --- Server ---

variable "key_pair_name" {
  description = "Name of a key pair already created in OpenStack (Compute -> Key Pairs)"
  type        = string
}

variable "name_prefix" {
  description = "Prefix for all resource names"
  type        = string
  default     = "terminal"
}

variable "external_network_name" {
  description = "External network that gives public floating IPs"
  type        = string
  default     = "ntnu-exposed"
}

variable "image_name" {
  description = "OS image for the server"
  type        = string
  default     = "Ubuntu Server 24.04 LTS (Noble Numbat)"
}

variable "flavor_name" {
  description = "Server size (2 vCPU / 4 GB is enough for docker build and ~30 students)"
  type        = string
  default     = "gx3.2c4r"
}

variable "subnet_cidr" {
  description = "Private subnet for the server"
  type        = string
  default     = "10.10.0.0/24"
}

variable "ssh_allowed_cidrs" {
  description = "Who may SSH in, e.g. [\"1.2.3.4/32\"]. Inside NTNU the server sees your internal 10.x address, not your public one."
  type        = list(string)

  validation {
    condition     = alltrue([for cidr in var.ssh_allowed_cidrs : can(cidrhost(cidr, 0))])
    error_message = "Every entry in ssh_allowed_cidrs must be a CIDR, e.g. 1.2.3.4/32."
  }
}

variable "domain" {
  description = "Domain that points (DNS A record) at the floating IP, e.g. terminal.example.no"
  type        = string

  validation {
    condition     = can(regex("^[a-z0-9.-]+\\.[a-z]{2,}$", var.domain))
    error_message = "domain must be a hostname like terminal.example.no."
  }
}
