#!/usr/bin/env bash
# Build SENTINEX-CAT images and push to AWS ECR.
# Run from repo root on a machine with Docker + AWS CLI (laptop or CI).
#
# Required env (or set in .env — script loads .env if present):
#   AWS_REGION          e.g. ap-south-1
#   AWS_ACCOUNT_ID      12-digit account id
#   SUPABASE_URL        baked into frontend at build time
#   SUPABASE_ANON_KEY   baked into frontend at build time
#
# Optional:
#   IMAGE_TAG           default: latest
#
# Usage:
#   cp .env.example .env   # fill values
#   bash scripts/ecr-build-push.sh          # Linux / macOS / Git Bash
#   .\scripts\ecr-build-push.ps1            # Windows PowerShell
#   bash scripts/ecr-build-push.sh v1.0.0   # custom tag

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

AWS_REGION="${AWS_REGION:?Set AWS_REGION in .env or environment}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:?Set AWS_ACCOUNT_ID in .env or environment}"
IMAGE_TAG="${1:-${IMAGE_TAG:-latest}}"
ECR_REGISTRY="${ECR_REGISTRY:-${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com}"

BACKEND_REPO="sentinex-cat-backend"
FRONTEND_REPO="sentinex-cat-frontend"
BACKEND_IMAGE="${ECR_REGISTRY}/${BACKEND_REPO}:${IMAGE_TAG}"
FRONTEND_IMAGE="${ECR_REGISTRY}/${FRONTEND_REPO}:${IMAGE_TAG}"

SUPABASE_URL="${SUPABASE_URL:?Set SUPABASE_URL for frontend build}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:?Set SUPABASE_ANON_KEY for frontend build}"

echo "==> ECR registry: ${ECR_REGISTRY}"
echo "==> Image tag:    ${IMAGE_TAG}"

echo "==> Logging in to ECR..."
aws ecr get-login-password --region "${AWS_REGION}" \
  | docker login --username AWS --password-stdin "${ECR_REGISTRY}"

echo "==> Ensuring ECR repositories exist..."
aws ecr describe-repositories --repository-names "${BACKEND_REPO}" --region "${AWS_REGION}" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "${BACKEND_REPO}" --region "${AWS_REGION}" --image-scanning-configuration scanOnPush=true
aws ecr describe-repositories --repository-names "${FRONTEND_REPO}" --region "${AWS_REGION}" >/dev/null 2>&1 \
  || aws ecr create-repository --repository-name "${FRONTEND_REPO}" --region "${AWS_REGION}" --image-scanning-configuration scanOnPush=true

export DOCKER_BUILDKIT=1

cache_from_args() {
  local image="$1"
  if docker image inspect "${image}" >/dev/null 2>&1; then
    printf '%s' "--cache-from ${image}"
  fi
}

echo "==> Pulling prior images for layer cache (optional)..."
docker pull "${BACKEND_IMAGE}" >/dev/null 2>&1 || true
docker pull "${FRONTEND_IMAGE}" >/dev/null 2>&1 || true

BACKEND_CACHE_FROM="$(cache_from_args "${BACKEND_IMAGE}")"
FRONTEND_CACHE_FROM="$(cache_from_args "${FRONTEND_IMAGE}")"

echo "==> Building backend..."
# shellcheck disable=SC2086
docker build -f docker/backend/Dockerfile \
  ${BACKEND_CACHE_FROM} \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  -t "${BACKEND_REPO}:${IMAGE_TAG}" .
docker tag "${BACKEND_REPO}:${IMAGE_TAG}" "${BACKEND_IMAGE}"

echo "==> Building frontend (Supabase keys baked in, dashboard-only context)..."
# shellcheck disable=SC2086
docker build -f docker/frontend/Dockerfile \
  ${FRONTEND_CACHE_FROM} \
  --build-context "nginxconf=${ROOT_DIR}/docker/frontend" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  --build-arg "VITE_SUPABASE_URL=${SUPABASE_URL}" \
  --build-arg "VITE_SUPABASE_ANON_KEY=${SUPABASE_ANON_KEY}" \
  -t "${FRONTEND_REPO}:${IMAGE_TAG}" \
  "${ROOT_DIR}/dashboard"

echo "==> Pushing to ECR..."
docker push "${BACKEND_IMAGE}"
docker push "${FRONTEND_IMAGE}"

echo ""
echo "Done."
echo "  Backend:  ${BACKEND_IMAGE}"
echo "  Frontend: ${FRONTEND_IMAGE}"
echo ""
echo "On EC2, set in .env:"
echo "  ECR_REGISTRY=${ECR_REGISTRY}"
echo "  IMAGE_TAG=${IMAGE_TAG}"
echo "Then: bash scripts/ec2-pull-up.sh"
