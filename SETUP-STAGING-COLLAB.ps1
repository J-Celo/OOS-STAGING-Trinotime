# ONE-TIME setup for TrinoTime OOS STAGING collaboration ONLY.
# This script NEVER touches J-Celo/OOS production or deploys to Cloudflare.
# Requirements: Git for Windows, GitHub CLI `gh` logged into J-Celo.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$repoName = 'J-Celo/OOS-STAGING'
$repoGit = 'https://github.com/J-Celo/OOS-STAGING.git'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

function Stop-Safely([string]$message) { throw "STOP: $message" }
function Check-LastCommand([string]$message) { if ($LASTEXITCODE -ne 0) { Stop-Safely $message } }

if (-not (Test-Path '.\STAGING-ONLY.txt')) { Stop-Safely 'This is not the expected staging project root.' }
if (-not (Test-Path '.\cloudflare\wrangler.staging.jsonc')) { Stop-Safely 'Staging-only Wrangler config not found.' }
$conf = Get-Content '.\cloudflare\wrangler.staging.jsonc' -Raw
if ($conf -notmatch 'oostrinotime-staging-qa' -or $conf -notmatch 'trinotime-staging-qa') {
  Stop-Safely 'Staging identity does not match expected isolated environment.'
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Stop-Safely 'Git is required; install Git for Windows first.' }

# Never initialize or commit inside an existing parent checkout, especially production.
$parentFolder = (Get-Item -LiteralPath $root).Parent
while ($null -ne $parentFolder) {
  if (Test-Path -LiteralPath (Join-Path $parentFolder.FullName '.git')) {
    Stop-Safely ("Folder is inside another Git repository: " + $parentFolder.FullName)
  }
  $parentFolder = $parentFolder.Parent
}
if (-not (Test-Path '.\.git')) {
  & git init -b main
  Check-LastCommand 'Could not initialize local staging Git repo.'
}
$origin = $null
$remotes = @(& git remote)
if ($remotes -contains 'origin') {
  $origin = & git remote get-url origin
  Check-LastCommand 'Could not read existing origin.'
  if ([string]$origin -notmatch '(?i)(?:github\.com[:/])J-Celo/OOS-STAGING(?:\.git)?$') {
    Stop-Safely "Existing origin is not the staging repository. Refusing to touch it: $origin"
  }
}

# Inspect staged file names before any commit or upload.
& git add --all
Check-LastCommand 'git add failed.'
$stagedNames = @(& git diff --cached --name-only)
$allowedZipPaths = @('cloudflare/public/downloads/TrinoTime-QC-Tracker-v2.2.62.zip', 'cloudflare/fixtures/TrinoTime-QC-Tracker-v2.2.32.zip')
$blocked = @($stagedNames | Where-Object {
  ($_.ToLowerInvariant().EndsWith('.zip') -and $allowedZipPaths -notcontains $_) -or
  $_ -match '(?i)(^|/)(?:node_modules|\.wrangler|\.firebase|\.secrets|\.env(?:\..*)?|CURRENT-STAGING-RULES\.json|candidate\.rules\.json)(/|$)' -or
  $_ -match '(?i)(?:private.?key|service.?account|credentials).*\.(json|pem|txt)$' -or
  $_ -match '(?i)\.(?:pem|p12|pfx|key|db|sqlite|log|csv)$'
})
if ($blocked.Count -gt 0) { Stop-Safely ("Potentially sensitive/generated staged paths found. No push performed: " + ($blocked -join ', ')) }

$names = @(& git diff --cached --name-only)
if ($names.Count -gt 0) {
  & git commit -m 'Initialize isolated TrinoTime UX18P46 staging collaboration'
  Check-LastCommand 'Commit did not complete; check Git author identity. No remote changes were made.'
}
& git branch -M main
Check-LastCommand 'Cannot select staging main branch.'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "Local staging Git source is ready but not uploaded." -ForegroundColor Yellow
  Write-Host 'GitHub CLI is not installed. Either install GitHub CLI, run gh auth login, and rerun this script; or create an EMPTY PRIVATE OOS-STAGING repository manually, then run: git remote add origin https://github.com/J-Celo/OOS-STAGING.git ; git push -u origin main' -ForegroundColor Yellow
  Write-Host 'Do not use the existing J-Celo/OOS production repository.' -ForegroundColor Red
  exit 0
}
$previousErrorPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try { & gh auth status 2>$null | Out-Null; $authExit = $LASTEXITCODE }
finally { $ErrorActionPreference = $previousErrorPreference }
if ($authExit -ne 0) {
  Write-Host 'Please sign in with: gh auth login (your own GitHub account), then rerun this script.' -ForegroundColor Yellow
  exit 0
}
$loggedIn = (& gh api user --jq '.login')
Check-LastCommand 'Could not verify GitHub login.'
if ([string]$loggedIn -cne 'J-Celo') { Stop-Safely "Connected GitHub user is $loggedIn, expected J-Celo. No push performed." }

$previousErrorPreference = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
try { & gh repo view $repoName --json isPrivate --jq '.isPrivate' 2>$null | Out-Null; $repoViewExit = $LASTEXITCODE }
finally { $ErrorActionPreference = $previousErrorPreference }
if ($repoViewExit -ne 0) {
  Write-Host "Creating private staging repository $repoName..." -ForegroundColor Cyan
  & gh repo create $repoName --private --description 'TrinoTime OOS isolated staging development and collaboration'
  Check-LastCommand 'GitHub private repository creation failed.'
}
$visibility = & gh repo view $repoName --json isPrivate --jq '.isPrivate'
Check-LastCommand 'Could not verify GitHub repository privacy.'
if ([string]$visibility -ne 'true') { Stop-Safely 'Staging repository is NOT private. Refusing to push.' }

if ($remotes -notcontains 'origin') {
  & git remote add origin $repoGit
  Check-LastCommand 'Unable to add staging remote.'
}
& git push --set-upstream origin main
Check-LastCommand 'Git push failed. Local source is still intact; inspect authentication and retry.'
Write-Host "SUCCESS: Private staging source pushed to $repoName" -ForegroundColor Green
Write-Host 'Invite your friend from the staging repository Settings > Collaborators.' -ForegroundColor Green
Write-Host 'Do not share production credentials or enable automatic production deployment.' -ForegroundColor Green
