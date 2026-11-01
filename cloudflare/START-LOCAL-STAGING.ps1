# TrinoTime: run the local staging preview only after a fail-closed safety preflight.
# Run from any directory, or run from VS Code as a task.
param([ValidateRange(1024,65535)][int]$Port = 8790)
$ErrorActionPreference = 'Stop'

$cf = $PSScriptRoot
$configFile = Join-Path $cf 'wrangler.staging.jsonc'
$secretsFile = Join-Path $cf '.dev.vars'

if (-not (Test-Path -LiteralPath $configFile -PathType Leaf)) {
    throw 'Cannot find cloudflare/wrangler.staging.jsonc. Keep this script in the cloudflare folder.'
}
if (-not (Test-Path -LiteralPath $secretsFile -PathType Leaf)) {
    throw 'Cannot find cloudflare/.dev.vars. Keep staging-only secrets in that file.'
}

$configText = Get-Content -LiteralPath $configFile -Raw
function Read-ConfigValue([string]$Name) {
    $pattern = '"' + [regex]::Escape($Name) + '"\s*:\s*"([^"\r\n]*)"'
    $match = [regex]::Match($configText, $pattern)
    if (-not $match.Success) { throw "Missing Wrangler setting: $Name" }
    return $match.Groups[1].Value
}
$mode    = Read-ConfigValue 'DEPLOYMENT_ENV'
$project = Read-ConfigValue 'FIREBASE_PROJECT_ID'
$db      = Read-ConfigValue 'FIREBASE_DATABASE_URL'
$auth    = Read-ConfigValue 'FIREBASE_AUTH_DOMAIN'
$storage = Read-ConfigValue 'FIREBASE_STORAGE_BUCKET'

if ($mode -ne 'staging' -or $project -ne 'trinotime-staging-qa') {
    throw 'STOP: This is not the expected TrinoTime staging project.'
}
foreach ($resource in @($db, $auth, $storage)) {
    if ($resource -notmatch [regex]::Escape($project) -or $resource -match 'cwh-timeclock') {
        throw 'STOP: One Firebase resource does not match the staging project.'
    }
}
if ($configText -match '"remote"\s*:\s*true') {
    throw 'STOP: Wrangler configuration contains a remote binding. Inspect it before local development.'
}
$leave = [regex]::Match($configText, '"LEAVE_API_ENDPOINT"\s*:\s*"([^"\r\n]*)"')
if ($leave.Success -and $leave.Groups[1].Value -and $leave.Groups[1].Value -notmatch [regex]::Escape($project)) {
    throw 'STOP: Leave API points outside the expected staging project.'
}

# Reuse the exact same fail-closed validation required before online staging deployment.
# No remote calls; production-reference wrangler.jsonc is only used for comparison.
Push-Location $cf
try {
    & node scripts/ensure-staging-read-routes.mjs
    if ($LASTEXITCODE -ne 0) { throw 'STOP: Staging API routing/configuration failed preparation.' }
    & node scripts/staging-config-preflight.mjs
    if ($LASTEXITCODE -ne 0) { throw 'STOP: Staging resource configuration failed the security preflight.' }
} finally {
    Pop-Location
}

$secretText = Get-Content -LiteralPath $secretsFile -Raw
foreach ($name in @('FIREBASE_CLIENT_EMAIL','FIREBASE_PRIVATE_KEY','CHAT_SESSION_SECRET')) {
    $pattern = '(?m)^' + [regex]::Escape($name) + '\s*=\s*\S+'
    if ($secretText -notmatch $pattern) { throw "Missing local secret: $name" }
}
# A valid-looking service account can still belong to production. Verify the
# identity *without printing it* before starting the local Worker.
$emailMatch = [regex]::Match($secretText, '(?m)^FIREBASE_CLIENT_EMAIL\s*=\s*([^\r\n]+)')
$email = if ($emailMatch.Success) { $emailMatch.Groups[1].Value.Trim().Trim('"', "'") } else { '' }
if ($email -notmatch '@trinotime-staging-qa\.iam\.gserviceaccount\.com$') {
    throw 'STOP: FIREBASE_CLIENT_EMAIL does not identify the dedicated staging Firebase project. Do not start local preview.'
}
Remove-Variable email, emailMatch, secretText -ErrorAction SilentlyContinue

Write-Host 'TRINOTIME LOCAL STAGING PREFLIGHT: PASS' -ForegroundColor Green
Write-Host 'Secrets present (values not displayed).'
Write-Host 'Cloudflare bindings use local simulation (--local).'
Write-Host 'Firebase/HTTP services can still be remote. Do not alter real employee data.' -ForegroundColor Yellow
Write-Host "Local preview: http://127.0.0.1:$Port" -ForegroundColor Cyan
Write-Host 'Press Ctrl+C to stop.'

Push-Location $cf
try {
    & npx.cmd wrangler dev --config .\wrangler.staging.jsonc --local --live-reload --port $Port --env-file .\.dev.vars
    if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "Wrangler exited with code $LASTEXITCODE" }
} finally {
    Pop-Location
}
