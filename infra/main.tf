# --- Lookups (data sources) ---

# Key pair created by hand in OpenStack. Looking it up makes plan fail early if the name is wrong.
data "openstack_compute_keypair_v2" "this" {
  name = var.key_pair_name
}

data "openstack_networking_network_v2" "external" {
  name     = var.external_network_name
  external = true
}

data "openstack_images_image_v2" "ubuntu" {
  name        = var.image_name
  most_recent = true
}

locals {
  # Open to everyone: the public website (80 also serves the Let's Encrypt challenge).
  public_ports = {
    http  = 80
    https = 443
  }

  dns_nameservers = ["1.1.1.1", "8.8.8.8"]
}

# --- Network: private subnet with a router out to the external network ---

resource "openstack_networking_network_v2" "this" {
  name = "${var.name_prefix}-net"
}

resource "openstack_networking_subnet_v2" "this" {
  name            = "${var.name_prefix}-subnet"
  network_id      = openstack_networking_network_v2.this.id
  cidr            = var.subnet_cidr
  ip_version      = 4
  dns_nameservers = local.dns_nameservers
}

resource "openstack_networking_router_v2" "this" {
  name                = "${var.name_prefix}-router"
  external_network_id = data.openstack_networking_network_v2.external.id
}

resource "openstack_networking_router_interface_v2" "this" {
  router_id = openstack_networking_router_v2.this.id
  subnet_id = openstack_networking_subnet_v2.this.id
}

# --- Firewall ---

resource "openstack_networking_secgroup_v2" "this" {
  name        = "${var.name_prefix}-web"
  description = "HTTP/HTTPS from anywhere, SSH from ssh_allowed_cidrs"
}

resource "openstack_networking_secgroup_rule_v2" "public" {
  for_each = local.public_ports

  description       = each.key
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = each.value
  port_range_max    = each.value
  remote_ip_prefix  = "0.0.0.0/0"
  security_group_id = openstack_networking_secgroup_v2.this.id
}

resource "openstack_networking_secgroup_rule_v2" "ssh" {
  for_each = toset(var.ssh_allowed_cidrs)

  description       = "ssh"
  direction         = "ingress"
  ethertype         = "IPv4"
  protocol          = "tcp"
  port_range_min    = 22
  port_range_max    = 22
  remote_ip_prefix  = each.value
  security_group_id = openstack_networking_secgroup_v2.this.id
}

# --- Server ---

# The server's network port carries the firewall rules and gets the floating IP.
resource "openstack_networking_port_v2" "server" {
  name               = "${var.name_prefix}-port"
  network_id         = openstack_networking_network_v2.this.id
  security_group_ids = [openstack_networking_secgroup_v2.this.id]

  fixed_ip {
    subnet_id = openstack_networking_subnet_v2.this.id
  }
}

resource "openstack_compute_instance_v2" "server" {
  name        = "${var.name_prefix}-server"
  image_id    = data.openstack_images_image_v2.ubuntu.id
  flavor_name = var.flavor_name
  key_pair    = data.openstack_compute_keypair_v2.this.name

  # Installs Docker and Caddy on first boot.
  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    domain = var.domain
  })

  network {
    port = openstack_networking_port_v2.server.id
  }

  # cloud-init needs internet access, which only works once the router is connected.
  depends_on = [openstack_networking_router_interface_v2.this]
}

# --- Public IP ---

# Its own resource, so the IP (and the DNS record) stays the same if the server is rebuilt.
resource "openstack_networking_floatingip_v2" "server" {
  pool = data.openstack_networking_network_v2.external.name
}

resource "openstack_networking_floatingip_associate_v2" "server" {
  floating_ip = openstack_networking_floatingip_v2.server.address
  port_id     = openstack_networking_port_v2.server.id

  depends_on = [openstack_networking_router_interface_v2.this]
}
