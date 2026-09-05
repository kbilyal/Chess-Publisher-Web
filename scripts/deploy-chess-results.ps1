$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

if (-not (Test-Path '.env.production')) {
  Write-Host '.env.production is missing. Run scripts/prepare-chess-results-env.ps1 first.'
  exit 1
}

Write-Host 'Building the production backend...'
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Starting the deployed stack via Docker Compose...'
& docker compose up --build -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Deployment started.'
Write-Host 'Verify with: curl https://<your-backend-host>/api/health'
Write-Host 'and: curl -X POST https://<your-backend-host>/api/chess-results/test -H "Authorization: Bearer <token>"'
