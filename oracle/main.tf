terraform {
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = ">= 5.0.0"
    }
  }
}

provider "oci" {
  region = var.region
}

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.compartment_ocid
}

resource "random_string" "suffix" {
  length  = 6
  special = false
  upper   = false
}

locals {
  name_prefix = "postbase-${random_string.suffix.result}"
  ad          = data.oci_identity_availability_domains.ads.availability_domains[0].name
}

# ── Networking: a minimal VCN with a public subnet ──────────────────────────
resource "oci_core_vcn" "vcn" {
  compartment_id = var.compartment_ocid
  cidr_blocks    = ["10.0.0.0/16"]
  display_name   = "${local.name_prefix}-vcn"
}

resource "oci_core_internet_gateway" "igw" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.vcn.id
  display_name   = "${local.name_prefix}-igw"
}

resource "oci_core_route_table" "rt" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.vcn.id
  display_name   = "${local.name_prefix}-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    network_entity_id = oci_core_internet_gateway.igw.id
  }
}

resource "oci_core_security_list" "seclist" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.vcn.id
  display_name   = "${local.name_prefix}-seclist"

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  ingress_security_rules {
    source   = "0.0.0.0/0"
    protocol = "6" # TCP
    tcp_options { min = 3000, max = 3000 }
  }

  # Postgres access confined to the VCN
  ingress_security_rules {
    source   = "10.0.0.0/16"
    protocol = "6"
    tcp_options { min = 5432, max = 5432 }
  }
}

resource "oci_core_subnet" "subnet" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.vcn.id
  cidr_block                 = "10.0.1.0/24"
  display_name               = "${local.name_prefix}-subnet"
  route_table_id             = oci_core_route_table.rt.id
  security_list_ids          = [oci_core_security_list.seclist.id]
  prohibit_public_ip_on_vnic = false
}

# ── OCI Database with PostgreSQL ────────────────────────────────────────────
resource "random_password" "db_password" {
  length  = 24
  special = false
}

resource "oci_psql_db_system" "db" {
  compartment_id      = var.compartment_ocid
  display_name        = "${local.name_prefix}-db"
  shape               = var.db_shape
  db_version          = "16"
  instance_count      = 1
  instance_ocpu_count = 1
  instance_memory_size_in_gbs = 8

  network_details {
    subnet_id = oci_core_subnet.subnet.id
  }

  storage_details {
    is_regionally_durable = false
    availability_domain   = local.ad
    system_type           = "OCI_OPTIMIZED_STORAGE"
    iops                  = 3000
  }

  credentials {
    username        = "postbase"
    password_details {
      password_type = "PLAIN_TEXT"
      password      = random_password.db_password.result
    }
  }

  management_policy {
    backup_policy {
      kind               = "OCI_AUTOMATIC"
      retention_days     = 7
    }
  }
}

locals {
  database_url = "postgresql://postbase:${random_password.db_password.result}@${oci_psql_db_system.db.instance_endpoints[0].fqdn}:5432/postbase"
}

# ── OCIR + DevOps build pipeline (builds Dockerfile.railway from GitHub) ────
resource "oci_artifacts_container_repository" "repo" {
  compartment_id = var.compartment_ocid
  display_name   = "${local.name_prefix}/postbase"
  is_public      = false
}

resource "oci_devops_project" "project" {
  compartment_id = var.compartment_ocid
  name           = "${local.name_prefix}-project"
}

resource "oci_devops_build_pipeline" "pipeline" {
  project_id   = oci_devops_project.project.id
  display_name = "${local.name_prefix}-build"
}

resource "oci_devops_connection" "github" {
  project_id      = oci_devops_project.project.id
  connection_type = "GITHUB_ACCESS_TOKEN"
  display_name    = "${local.name_prefix}-github"
  # OCI DevOps's GitHub connection type requires a token even for public repos
  # — see oracle/README.md for how to supply one via TF_VAR_github_access_token.
  access_token = var.github_access_token
}

resource "oci_devops_build_pipeline_stage" "build_stage" {
  build_pipeline_id                 = oci_devops_build_pipeline.pipeline.id
  display_name                      = "build-and-push"
  build_pipeline_stage_type         = "BUILD"
  build_pipeline_stage_predecessor_collection {
    items { id = oci_devops_build_pipeline.pipeline.id }
  }
  build_spec_file        = "oracle/build_spec.yaml"
  image                  = "OL7_X86_64_STANDARD_10"
  build_source_collection {
    items {
      name             = "postbase_source"
      repository_url   = var.github_repo_url
      repository_id    = oci_devops_connection.github.id
      branch           = var.github_branch
      connection_type  = "GITHUB"
    }
  }
}

resource "oci_devops_build_pipeline_stage" "deliver_stage" {
  build_pipeline_id         = oci_devops_build_pipeline.pipeline.id
  display_name              = "push-to-ocir"
  build_pipeline_stage_type = "DELIVER_ARTIFACT"
  build_pipeline_stage_predecessor_collection {
    items { id = oci_devops_build_pipeline_stage.build_stage.id }
  }
  deliver_artifact_collection {
    items {
      artifact_id   = oci_devops_deploy_artifact.image_artifact.id
      artifact_name = "postbase_image"
    }
  }
}

resource "oci_devops_deploy_artifact" "image_artifact" {
  deploy_artifact_type             = "DOCKER_IMAGE"
  project_id                       = oci_devops_project.project.id
  argument_substitution_mode       = "SUBSTITUTE_PLACEHOLDERS"
  deploy_artifact_source {
    deploy_artifact_source_type = "OCIR"
    image_uri                   = "${oci_artifacts_container_repository.repo.namespace}/${oci_artifacts_container_repository.repo.display_name}:latest"
  }
}

# Triggers the pipeline once on stack creation.
resource "null_resource" "run_build" {
  triggers = {
    branch = var.github_branch
  }

  provisioner "local-exec" {
    command = "oci devops build-run create-build-run-source-github --build-pipeline-id ${oci_devops_build_pipeline.pipeline.id} --wait-for-state SUCCEEDED --wait-for-state FAILED"
  }

  depends_on = [oci_devops_build_pipeline_stage.deliver_stage]
}

# ── Container Instance ──────────────────────────────────────────────────────
# NOTE: OCI Container Instances don't support in-place env var updates, and a
# reserved-IP-first approach was considered but not used here since it hasn't
# been verified against the provider's actual VNIC-attachment schema. As a
# result NEXTAUTH_URL is NOT set automatically — see oracle/README.md for the
# one manual step required after the stack finishes applying.
resource "oci_container_instances_container_instance" "app" {
  compartment_id      = var.compartment_ocid
  display_name        = "${local.name_prefix}-app"
  availability_domain = local.ad
  shape                = var.container_instance_shape

  shape_config {
    ocpus         = var.container_instance_ocpus
    memory_in_gbs = var.container_instance_memory_gb
  }

  containers {
    display_name = "postbase"
    image_url    = "${oci_artifacts_container_repository.repo.namespace}/${oci_artifacts_container_repository.repo.display_name}:latest"

    environment_variables = {
      HOSTNAME              = "0.0.0.0"
      PORT                   = "3000"
      DATABASE_URL           = local.database_url
      NEXTAUTH_SECRET        = var.auth_secret
      POSTBASE_JWT_SECRET    = var.auth_secret
    }
  }

  vnics {
    subnet_id             = oci_core_subnet.subnet.id
    is_public_ip_assigned  = true
  }

  depends_on = [null_resource.run_build, oci_psql_db_system.db]
}

locals {
  service_url = "http://${oci_container_instances_container_instance.app.vnics[0].public_ip}:3000"
}

output "service_url" {
  value       = local.service_url
  description = "Postbase is reachable here, but NEXTAUTH_URL is not yet set to this value — see oracle/README.md to finish setup."
}
