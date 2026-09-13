# Memgraph (memgraph-mage container) on a single Compute Engine VM, with a
# persistent data disk for durability.
#
# Memgraph is in-memory but persists snapshots + WAL to its data directory
# (/var/lib/memgraph). We mount a persistent pd-ssd there, so a VM
# restart/resize REOPENS the graph from its snapshot in seconds rather than
# re-projecting from `graph_version` (replay stays the first-seed / disaster-
# recovery path, not the routine-restart path). memgraph-mage ships the MAGE
# algorithm modules the projection queries use (wShortest / BFS /
# weakly_connected_components / k-shortest / bridges / ...).
#
# Deploys per the official GCP guide (https://memgraph.com/docs/deployment): a
# CE VM running `docker run -p 7687:7687 memgraph/memgraph-mage`. Bolt on 7687.

terraform {
  required_version = ">= 1.9"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

resource "google_compute_firewall" "bolt" {
  name    = "${var.name}-bolt"
  network = var.network
  project = var.project

  allow {
    protocol = "tcp"
    ports    = ["7687"]
  }

  # Lock bolt down to explicit ranges (the VPC connector range in prod; your
  # workstation /32 for an ad-hoc test). Never 0.0.0.0/0 for a graph DB.
  source_ranges = var.bolt_source_ranges
  target_tags   = [var.name]
}

# Persistent data disk for Memgraph snapshots + WAL. Survives VM
# restart/resize (the boot disk + container are disposable; this is not).
resource "google_compute_disk" "data" {
  name    = "${var.name}-data"
  project = var.project
  zone    = var.zone
  type    = "pd-ssd"
  size    = var.data_disk_size
}

resource "google_compute_instance" "memgraph" {
  name         = var.name
  project      = var.project
  zone         = var.zone
  machine_type = var.machine_type
  tags         = [var.name]

  boot_disk {
    initialize_params {
      image = "ubuntu-os-cloud/ubuntu-2204-lts"
      size  = var.boot_disk_size
      type  = "pd-ssd"
    }
  }

  attached_disk {
    source      = google_compute_disk.data.id
    device_name = "memgraph-data"
  }

  network_interface {
    network    = var.network
    subnetwork = var.subnetwork

    # An external IP is opt-in: handy for an ad-hoc test from your workstation
    # (paired with a /32 source range), off for the real VPC-internal deploy.
    dynamic "access_config" {
      for_each = var.assign_external_ip ? [1] : []
      content {}
    }
  }

  # Mount the persistent disk at Memgraph's data dir, then run the container
  # with durability on. The `-p` publish is what makes bolt reachable on the
  # host's 7687. First boot formats the disk; later boots reuse the snapshots.
  metadata = {
    startup-script = <<-EOT
      #!/bin/bash
      set -eux
      export DEBIAN_FRONTEND=noninteractive

      DISK=/dev/disk/by-id/google-memgraph-data
      if ! blkid "$DISK"; then mkfs.ext4 -m 0 -F "$DISK"; fi
      mkdir -p /mnt/memgraph
      grep -q "$DISK" /etc/fstab || echo "$DISK /mnt/memgraph ext4 discard,defaults,nofail 0 2" >> /etc/fstab
      mount -a
      mkdir -p /mnt/memgraph/data
      # memgraph runs as uid:gid 101:103 inside the image and SEGFAULTs on a
      # bind-mount it doesn't own (chmod alone is not enough) — give it the dir.
      chown -R 101:103 /mnt/memgraph/data

      # Memgraph needs a high vm.max_map_count (like Elasticsearch); the
      # default 65530 makes it segfault on startup. Persist + apply now.
      echo "vm.max_map_count=524288" > /etc/sysctl.d/99-memgraph.conf
      sysctl -w vm.max_map_count=524288

      apt-get update
      apt-get install -y docker.io
      systemctl enable --now docker
      docker run -d --name memgraph --restart unless-stopped \
        -p 7687:7687 \
        -v /mnt/memgraph/data:/var/lib/memgraph \
        ${var.memgraph_image} \
        --storage-snapshot-interval-sec=300 \
        --storage-snapshot-on-exit=true \
        --storage-wal-enabled=true
    EOT
  }
}
