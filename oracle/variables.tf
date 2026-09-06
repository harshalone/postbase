variable "compartment_ocid" {
  type        = string
  description = "Compartment OCID to create Postbase resources in."
}

variable "auth_secret" {
  type        = string
  description = "Shared secret for NEXTAUTH_SECRET / POSTBASE_JWT_SECRET."
  sensitive   = true

  validation {
    condition     = length(var.auth_secret) >= 16
    error_message = "auth_secret must be at least 16 characters."
  }
}

variable "github_repo_url" {
  type        = string
  default     = "https://github.com/harshalone/postbase.git"
  description = "Repo to build Dockerfile.railway from."
}

variable "github_branch" {
  type    = string
  default = "main"
}

variable "github_access_token" {
  type        = string
  default     = ""
  sensitive   = true
  description = "GitHub personal access token with repo:read scope — required by OCI DevOps's GitHub connection even for public repos. Set via TF_VAR_github_access_token; see oracle/README.md."
}

variable "region" {
  type        = string
  default     = "us-ashburn-1"
  description = "OCI region for all resources."
}

variable "db_shape" {
  type    = string
  default = "PostgreSQL.VM.Standard.E4.Flex.1.8GB"
}

variable "container_instance_shape" {
  type    = string
  default = "CI.Standard.E4.Flex"
}

variable "container_instance_ocpus" {
  type    = number
  default = 1
}

variable "container_instance_memory_gb" {
  type    = number
  default = 4
}
