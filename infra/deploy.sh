#!/bin/sh
# Copies the app to the server and (re)starts the container. Run after `terraform apply`.
#   ./infra/deploy.sh
# Needs ADMIN_PASSWORD in ../.env or the shell. Optional: SSH_KEY=~/.ssh/my-key to pick the private key.
set -eu

INFRA=$(cd "$(dirname "$0")" && pwd)
ROOT=$(dirname "$INFRA")

if [ -f "$ROOT/.env" ]; then
  set -a
  . "$ROOT/.env"
  set +a
fi
: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD in .env or the shell}"

IP=$(terraform -chdir="$INFRA" output -raw floating_ip)
HOST="ubuntu@$IP"
SSH="ssh -o StrictHostKeyChecking=accept-new ${SSH_KEY:+-i $SSH_KEY}"

echo "Waiting for cloud-init on $IP ..."
$SSH "$HOST" 'cloud-init status --wait >/dev/null'

echo "Copying the app ..."
rsync -az --delete -e "$SSH" \
  --exclude node_modules --exclude dist --exclude data --exclude infra --exclude .env \
  --exclude .superpowers --exclude .playwright-mcp --exclude test-results --exclude .DS_Store \
  "$ROOT/" "$HOST:app/"

# The password goes over stdin into a file only ubuntu can read, not on a command line.
printf 'ADMIN_PASSWORD=%s\n' "$ADMIN_PASSWORD" | $SSH "$HOST" 'umask 077 && cat > ~/app.env'

echo "Building and starting the container ..."
$SSH "$HOST" 'set -e
cd ~/app
sudo docker build -t terminal-oppgaver .
sudo docker rm -f terminal >/dev/null 2>&1 || true
sudo docker run -d --name terminal --restart unless-stopped \
  -p 127.0.0.1:8080:8080 --env-file ~/app.env \
  -v tq-data:/data -v ~/app/assets:/app/assets:ro \
  terminal-oppgaver'

echo "Done: $(terraform -chdir="$INFRA" output -raw url)"
