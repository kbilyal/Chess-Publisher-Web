$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$source = Join-Path $root '.env.example'
$destination = Join-Path $root '.env.production'

if (-not (Test-Path $source)) {
  throw "Missing template file: $source"
}

if (-not (Test-Path $destination)) {
  Copy-Item $source $destination
  Write-Host "Created $destination from the template."
} else {
  Write-Host "$destination already exists; leaving it in place."
}

Write-Host ""
Write-Host "Set the real values in $destination before deployment:"
Write-Host "  - CHESS_RESULTS_BRIDGE_URL"
Write-Host "  - CHESS_RESULTS_BRIDGE_TOKEN"
Write-Host "  - CHESS_RESULTS_WEB_ORIGIN"
Write-Host "  - PORT"
Write-Host ""
Write-Host "Do not commit the populated .env.production file to source control."
