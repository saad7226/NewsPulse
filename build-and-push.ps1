# NewsPulse — Build All Images & Push to GHCR
# Run this on your LOCAL PC (not on the server)
#
# Usage:
#   .\build-and-push.ps1 -GitHubUser "your-github-username"
#
# Prerequisites:
#   1. Docker Desktop running
#   2. Logged in to GHCR:
#      echo "YOUR_PAT" | docker login ghcr.io -u YOUR_USERNAME --password-stdin

param(
    [Parameter(Mandatory=$true)]
    [string]$GitHubUser
)

$REGISTRY = "ghcr.io/$GitHubUser"
$ROOT = "F:\SAAD\UNIVERSITY\FYP\NewsPulse"
$ErrorActionPreference = "Stop"

Set-Location $ROOT

function Build-And-Push {
    param([string]$Name, [string]$Path, [string]$BuildArgs = "")
    Write-Host "`n=== Building $Name ===" -ForegroundColor Cyan
    $tag = "$REGISTRY/$Name`:latest"
    if ($BuildArgs) {
        docker build $BuildArgs -t $tag $Path
    } else {
        docker build -t $tag $Path
    }
    if ($LASTEXITCODE -ne 0) { throw "Build failed for $Name" }
    Write-Host "Pushing $Name..." -ForegroundColor Yellow
    docker push $tag
    if ($LASTEXITCODE -ne 0) { throw "Push failed for $Name" }
    Write-Host "✅ $Name done" -ForegroundColor Green
}

Write-Host "================================================" -ForegroundColor Magenta
Write-Host " NewsPulse Build & Push — Registry: $REGISTRY" -ForegroundColor Magenta
Write-Host "================================================" -ForegroundColor Magenta

# ── PHASE 1: Shared ML Base (must be first) ───────────────────────────────
Write-Host "`n[PHASE 1] Building shared ML base image (~20 min)" -ForegroundColor White
Build-And-Push "newspulse-ml-base" "./ml-base"

# ── PHASE 2: Classification Services (use ml-base) ────────────────────────
Write-Host "`n[PHASE 2] Building classification services with baked models" -ForegroundColor White
Build-And-Push "newspulse-political-bias" "./political_bias" "--build-arg REGISTRY=$REGISTRY"
Build-And-Push "newspulse-fakenews" "./fakenews_detection" "--build-arg REGISTRY=$REGISTRY"

# ── PHASE 3: Groq-based Generation Services (tiny, no model) ─────────────
Write-Host "`n[PHASE 3] Building Groq-based services (fast, no model download)" -ForegroundColor White
Build-And-Push "newspulse-summarizer" "./article_summarizer"
Build-And-Push "newspulse-counter" "./counter_argument"

# ── PHASE 4: Infrastructure Services ─────────────────────────────────────
Write-Host "`n[PHASE 4] Building infrastructure services" -ForegroundColor White
Build-And-Push "newspulse-gateway" "./gateway"
Build-And-Push "newspulse-auth" "./auth_service"
Build-And-Push "newspulse-fetcher" "./article_fetcher"
Build-And-Push "newspulse-frontend" "./frontend"

# ── DONE ──────────────────────────────────────────────────────────────────
Write-Host "`n================================================" -ForegroundColor Green
Write-Host " ALL IMAGES BUILT AND PUSHED SUCCESSFULLY ✅" -ForegroundColor Green
Write-Host "================================================" -ForegroundColor Green
Write-Host "`nVerify your packages at:" -ForegroundColor White
Write-Host "  https://github.com/$GitHubUser?tab=packages" -ForegroundColor Cyan
Write-Host "`n⚠️  Make packages PUBLIC on GitHub before deploying!" -ForegroundColor Yellow
Write-Host "  Each package → Package settings → Change visibility → Public" -ForegroundColor Yellow
