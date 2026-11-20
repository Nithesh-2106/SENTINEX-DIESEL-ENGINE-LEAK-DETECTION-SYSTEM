# Build SENTINEX-CAT images and push to AWS ECR (Windows PowerShell).
# Requires: Docker Desktop, AWS CLI, and configured AWS credentials.
#
# Usage (from repo root):
#   .\scripts\ecr-build-push.ps1
#   .\scripts\ecr-build-push.ps1 -Tag v1.0.0

param(
    [string]$Tag = ""
)

$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $RootDir

function Import-DotEnv {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return }
    Get-Content $Path | ForEach-Object {
        $line = $_.Trim()
        if ($line -eq "" -or $line.StartsWith("#")) { return }
        $eq = $line.IndexOf("=")
        if ($eq -lt 1) { return }
        $name = $line.Substring(0, $eq).Trim()
        $value = $line.Substring($eq + 1).Trim()
        Set-Item -Path "env:$name" -Value $value
    }
}

Import-DotEnv (Join-Path $RootDir ".env")

if (-not $env:AWS_REGION) { throw "Set AWS_REGION in .env or environment" }
if (-not $env:AWS_ACCOUNT_ID) { throw "Set AWS_ACCOUNT_ID in .env or environment" }
if (-not $env:SUPABASE_URL) { throw "Set SUPABASE_URL for frontend build" }
if (-not $env:SUPABASE_ANON_KEY) { throw "Set SUPABASE_ANON_KEY for frontend build" }

$ImageTag = if ($Tag) { $Tag } elseif ($env:IMAGE_TAG) { $env:IMAGE_TAG } else { "latest" }
$EcrRegistry = if ($env:ECR_REGISTRY) {
    $env:ECR_REGISTRY
} else {
    "$($env:AWS_ACCOUNT_ID).dkr.ecr.$($env:AWS_REGION).amazonaws.com"
}

$BackendRepo = "sentinex-cat-backend"
$FrontendRepo = "sentinex-cat-frontend"
$BackendImage = "$EcrRegistry/${BackendRepo}:$ImageTag"
$FrontendImage = "$EcrRegistry/${FrontendRepo}:$ImageTag"

Write-Host "==> ECR registry: $EcrRegistry"
Write-Host "==> Image tag:    $ImageTag"

Write-Host "==> Logging in to ECR..."
$password = aws ecr get-login-password --region $env:AWS_REGION
if ($LASTEXITCODE -ne 0) { throw "aws ecr get-login-password failed" }
$password | docker login --username AWS --password-stdin $EcrRegistry
if ($LASTEXITCODE -ne 0) { throw "docker login failed" }

function Ensure-EcrRepository {
    param([string]$Name)
    aws ecr describe-repositories --repository-names $Name --region $env:AWS_REGION 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "==> Creating ECR repository: $Name"
        aws ecr create-repository `
            --repository-name $Name `
            --region $env:AWS_REGION `
            --image-scanning-configuration scanOnPush=true | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "Failed to create repository $Name" }
    }
}

Write-Host "==> Ensuring ECR repositories exist..."
Ensure-EcrRepository $BackendRepo
Ensure-EcrRepository $FrontendRepo

$env:DOCKER_BUILDKIT = "1"

function Get-CacheFromArgs {
    param([string]$Image)
    docker image inspect $Image 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        return @("--cache-from", $Image)
    }
    return @()
}

Write-Host "==> Pulling prior images for layer cache (optional)..."
docker pull $BackendImage 2>$null | Out-Null
docker pull $FrontendImage 2>$null | Out-Null

$BackendCacheFrom = Get-CacheFromArgs $BackendImage
$FrontendCacheFrom = Get-CacheFromArgs $FrontendImage
$DashboardDir = Join-Path $RootDir "dashboard"
$NginxConfDir = Join-Path $RootDir "docker/frontend"

Write-Host "==> Building backend..."
docker build -f docker/backend/Dockerfile `
    @BackendCacheFrom `
    --build-arg BUILDKIT_INLINE_CACHE=1 `
    -t "${BackendRepo}:$ImageTag" .
if ($LASTEXITCODE -ne 0) { throw "Backend docker build failed" }
docker tag "${BackendRepo}:$ImageTag" $BackendImage

Write-Host "==> Building frontend (Supabase keys baked in, dashboard-only context)..."
docker build -f docker/frontend/Dockerfile `
    @FrontendCacheFrom `
    --build-context "nginxconf=$NginxConfDir" `
    --build-arg BUILDKIT_INLINE_CACHE=1 `
    --build-arg "VITE_SUPABASE_URL=$($env:SUPABASE_URL)" `
    --build-arg "VITE_SUPABASE_ANON_KEY=$($env:SUPABASE_ANON_KEY)" `
    -t "${FrontendRepo}:$ImageTag" `
    $DashboardDir
docker tag "${FrontendRepo}:$ImageTag" $FrontendImage

Write-Host "==> Pushing to ECR..."
docker push $BackendImage
if ($LASTEXITCODE -ne 0) { throw "Backend push failed" }
docker push $FrontendImage
if ($LASTEXITCODE -ne 0) { throw "Frontend push failed" }

Write-Host ""
Write-Host "Done."
Write-Host "  Backend:  $BackendImage"
Write-Host "  Frontend: $FrontendImage"
Write-Host ""
Write-Host "On EC2, set in .env:"
Write-Host "  ECR_REGISTRY=$EcrRegistry"
Write-Host "  IMAGE_TAG=$ImageTag"
Write-Host "Then on Linux EC2: bash scripts/ec2-pull-up.sh"
