#!/usr/bin/env bash
# Pull latest images from ECR and start stack on EC2.
# Run from repo root on the EC2 instance (with docker-compose.yml + .env).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

AWS_REGION="${AWS_REGION:?Set AWS_REGION in .env}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID in .env}"
ECR_REGISTRY="${ECR_REGISTRY:-${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com}"
IMAGE_TAG="${IMAGE_TAG:-latest}"

echo "==> ECR login (${ECR_REGISTRY})..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

export ECR_REGISTRY IMAGE_TAG

echo "==> Pulling images (tag: ${IMAGE_TAG})..."
docker compose pull

echo "==> Starting services..."
docker compose up -d

echo "==> Status:"
docker compose ps

echo ""
echo "Dashboard: http://$(curl -s --max-time 2 http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || echo '<EC2_PUBLIC_IP>')/"
echo "Health:    http://<EC2_PUBLIC_IP>/api/health"
