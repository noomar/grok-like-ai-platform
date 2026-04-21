# Aurora Nest — Terraform module for Fly.io.
#
# Minimal, provider-agnostic-ish: swap the `fly_app` / `fly_volume` blocks for
# their Hetzner / Scaleway / Hcloud equivalents and the rest of the app lifts
# and shifts. State lives in the SQLite volume so we only need to move the
# volume (or restore from an export tarball) to migrate hosts.
#
# Usage:
#   cd infra/terraform
#   export FLY_API_TOKEN=...
#   terraform init
#   terraform apply \
#     -var app_name=aurora-nest \
#     -var region=ams \
#     -var shotstack_api_key=$SHOTSTACK_API_KEY \
#     -var admin_password=$ADMIN_PASSWORD

terraform {
  required_version = ">= 1.6.0"
  required_providers {
    fly = {
      source  = "fly-apps/fly"
      version = ">= 0.0.23"
    }
  }
}

variable "app_name" {
  description = "Fly.io app name (globally unique)."
  type        = string
  default     = "aurora-nest"
}

variable "region" {
  description = "Primary Fly region."
  type        = string
  default     = "ams"
}

variable "volume_size_gb" {
  description = "SQLite volume size. 3 GB fits ~500k jobs comfortably."
  type        = number
  default     = 3
}

variable "vm_memory_mb" {
  type    = number
  default = 512
}

variable "vm_cpus" {
  type    = number
  default = 1
}

variable "shotstack_api_key" {
  type      = string
  default   = ""
  sensitive = true
}

variable "admin_password" {
  type      = string
  default   = ""
  sensitive = true
}

provider "fly" {
  useinternaltunnel    = true
  internaltunnelorg    = "personal"
  internaltunnelregion = var.region
}

resource "fly_app" "aurora" {
  name = var.app_name
  org  = "personal"
}

resource "fly_volume" "aurora_data" {
  app    = fly_app.aurora.name
  name   = "aurora_data"
  region = var.region
  size   = var.volume_size_gb
}

# Store sensitive values as Fly secrets (equivalent to `fly secrets set …`).
resource "fly_secret" "shotstack" {
  count  = var.shotstack_api_key == "" ? 0 : 1
  app    = fly_app.aurora.name
  name   = "SHOTSTACK_API_KEY"
  value  = var.shotstack_api_key
}

resource "fly_secret" "admin" {
  count = var.admin_password == "" ? 0 : 1
  app   = fly_app.aurora.name
  name  = "ADMIN_PASSWORD"
  value = var.admin_password
}

output "app_url" {
  value = "https://${fly_app.aurora.name}.fly.dev"
}

output "next_steps" {
  value = <<-EOT
    Terraform provisioned the app, volume, and secrets.
    Now deploy the image from the repo root:

      flyctl deploy --app ${fly_app.aurora.name} --remote-only \
        --config infra/fly/fly.toml

    Or let the migration script do it:
      node scripts/migrate-nest.mjs --target=fly --app=${fly_app.aurora.name}
  EOT
}
