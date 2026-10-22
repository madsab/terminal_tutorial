output "floating_ip" {
  description = "Public IP of the server"
  value       = openstack_networking_floatingip_v2.server.address
}

output "dns_record" {
  description = "Create this record at your DNS provider"
  value       = "A  ${var.domain}  ->  ${openstack_networking_floatingip_v2.server.address}"
}

output "ssh_command" {
  value = "ssh ubuntu@${openstack_networking_floatingip_v2.server.address}"
}

output "url" {
  value = "https://${var.domain}/"
}
