# TrinoTime M2.9.66 RC2.3 - SAFE LOCAL QA ONLY
# This script neither publishes rules nor contacts the live Firebase staging/production projects.
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
function Invoke-Checked($Title, [scriptblock] $Command) {
    Write-Host "`n=== $Title ===" -ForegroundColor Cyan
    & $Command
    if ($LASTEXITCODE -ne 0) { throw "$Title failed (exit $LASTEXITCODE). No Firebase rules were published." }
}
Write-Host 'TrinoTime RC2.3 - Local Firebase rules security validation' -ForegroundColor Cyan
Write-Host 'DATA SOURCE: JSON pasted into ChatGPT; confirm it was copied from the current trinotime-staging-qa Rules tab.'
Write-Host 'PRODUCTION MUST REMAIN UNTOUCHED. THIS IS NOT A FIREBASE DEPLOYMENT.'
if (-not (Test-Path '.\CURRENT-STAGING-RULES.json')) { throw 'Missing CURRENT-STAGING-RULES.json. Stop.' }
Get-Command node -ErrorAction Stop | Out-Null
Get-Command npm.cmd -ErrorAction Stop | Out-Null
Get-Command java -ErrorAction Stop | Out-Null
Invoke-Checked '11 offline harness self-tests' { node .\offline-selftest.mjs }
Invoke-Checked 'Candidate generation and detailed diff' { node .\prepare-candidate.mjs }
Invoke-Checked 'Complete document static guard' { node .\static-guard.mjs }
Invoke-Checked 'Install testing dependencies (requires internet)' { npm.cmd install }
Invoke-Checked 'REAL local Firebase RTDB Emulator assertions' { npm.cmd run test:emulator }
Write-Host "`nLOCAL EMULATOR QA PASSED. This does NOT authorize Firebase publication or establish live staging compatibility." -ForegroundColor Green
