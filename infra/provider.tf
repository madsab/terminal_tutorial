# Connection to OpenStack with an application credential (no username/password).
# Create one in Horizon: Identity -> Application Credentials -> Create Application Credential.
# The secret is NOT stored in a file: set it in the shell before running Terraform:
#   export TF_VAR_openstack_application_credential_secret='...'
provider "openstack" {
  auth_url                      = var.openstack_auth_url
  region                        = var.openstack_region
  application_credential_id     = var.openstack_application_credential_id
  application_credential_secret = var.openstack_application_credential_secret
}
