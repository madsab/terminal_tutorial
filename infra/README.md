# Deploy på OpenStack (NTNU, TRD1)

Terraform lager nett, router, brannmur, server og en offentlig IP. Ved første oppstart installerer cloud-init Docker og Caddy.
Caddy henter HTTPS-sertifikat (Let's Encrypt) for domenet ditt og sender trafikken videre til appen på `127.0.0.1:8080`.
`deploy.sh` kopierer koden og starter containeren.

Åpne porter: 80 og 443 for alle, 22 bare fra `ssh_allowed_cidrs`. 8080 er ikke åpen utenfra.

## Første gang

1. **Application credential:** Horizon → Identity → Application Credentials → Create. Legg ID-en i `terraform.tfvars`
   og hemmeligheten i `.env` i rotmappa (git-ignorert):
   ```bash
   TF_VAR_openstack_application_credential_secret=...
   ADMIN_PASSWORD=...
   ```
2. **Fyll ut `terraform.tfvars`:** `key_pair_name` (Compute → Key Pairs), `ssh_allowed_cidrs` (din IP som `"1.2.3.4/32"`, og `"10.0.0.0/8"` når du sitter på NTNU-nettet) og `domain`.
3. **Lag infrastrukturen:**
   ```bash
   cd infra
   set -a; . ../.env; set +a
   terraform init
   terraform plan
   terraform apply
   ```
4. **DNS:** lag A-posten som står i `terraform output dns_record` hos DNS-leverandøren din.
5. **Deploy appen:** `./infra/deploy.sh` (kjøres på nytt ved hver endring). Bruk `SSH_KEY=~/.ssh/nøkkel ./infra/deploy.sh` hvis
   SSH ikke finner nøkkelen selv.
6. **Test:** åpne `terraform output url`, og kjør testen i hoved-README («Test på IDUN»): elevside fra mobil, `/admin` starter en oppgave.

## Greit å vite

* Terraform-tilstanden (`terraform.tfstate`) ligger lokalt i `infra/`. Ikke slett den, og ikke del den: uten den vet ikke Terraform hva som finnes.
* Den offentlige IP-en er en egen ressurs. Bygges serveren på nytt, beholder den IP-en, så DNS-posten trenger ikke endres.
* Sertifikatet kommer først når DNS peker riktig. Caddy prøver igjen av seg selv. Logg: `ssh ubuntu@<ip> journalctl -u caddy`.
* Rydd opp etterpå: `terraform destroy`.
