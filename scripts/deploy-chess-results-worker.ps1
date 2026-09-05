$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $root

$workerConfig = Join-Path $root 'workers\chess-results\wrangler.jsonc'
if (-not (Test-Path $workerConfig)) {
  throw "Wrangler config not found: $workerConfig"
}

# Optional: update the allowed browser origin before deploy.
$defaultWebOrigin = 'https://web.chess-publisher.org'
$webOrigin = Read-Host "Allowed public web origin [$defaultWebOrigin]"
if ([string]::IsNullOrWhiteSpace($webOrigin)) {
  $webOrigin = $defaultWebOrigin
}

$raw = Get-Content $workerConfig -Raw
$updated = [regex]::Replace($raw, '"WEB_ORIGIN"\s*:\s*"[^"]*"', '"WEB_ORIGIN": "' + $webOrigin + '"')
if ($updated -eq $raw) {
  $updated = [regex]::Replace($raw, '"vars"\s*:\s*\{', '"vars": {' + "`n    `"WEB_ORIGIN`": `"$webOrigin`"")
}
Set-Content -Path $workerConfig -Value $updated
Write-Host "Updated web origin to: $webOrigin"

Write-Host 'Ensure you are logged into Cloudflare before deployment.'
& npx wrangler login
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Wrangler will now prompt for the secret values for CR_AES_KEY and CR_AES_IV.'
Write-Host 'These are the official Chess-Results bridge secrets and must be entered in the terminal.'
Write-Host ''

& npx wrangler secret put CR_AES_KEY --config $workerConfig
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& npx wrangler secret put CR_AES_IV --config $workerConfig
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host 'Deploying Chess-Results Worker...'
& npx wrangler deploy --config $workerConfig
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ''
Write-Host 'Deployment started successfully.'
Write-Host 'Next smoke test:'
Write-Host '  curl -i https://<your-worker-domain>/api/health'
Write-Host '  curl -i -X POST https://<your-worker-domain>/api/chess-results/test -H "Authorization: Bearer <user-organizer-token>" -H "Content-Type: application/json"'
