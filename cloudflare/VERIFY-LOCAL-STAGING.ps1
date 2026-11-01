# TrinoTime: read-only local runtime check. Prints booleans only; never prints secrets.
param([ValidateRange(1024,65535)][int]$Port = 8790)
$ErrorActionPreference = 'Stop'
$baseUrl = "http://127.0.0.1:$Port"

$js = (Invoke-WebRequest -Uri "$baseUrl/trinotime-runtime-config.js" -UseBasicParsing).Content
$match = [regex]::Match($js, 'Object\.freeze\((\{.*\})\)', [System.Text.RegularExpressions.RegexOptions]::Singleline)
if (-not $match.Success) { throw 'Cannot read runtime config from local Worker.' }
$runtime = $match.Groups[1].Value | ConvertFrom-Json
$health = Invoke-RestMethod -Uri "$baseUrl/api/chat/health"
$expectedProject = 'trinotime-staging-qa'

$checks = [ordered]@{
    'Staging deployment flag'         = ($runtime.deploymentEnv -eq 'staging')
    'Correct Firebase project'        = ($runtime.firebase.projectId -eq $expectedProject)
    'Staging database URL'            = ($runtime.firebase.databaseURL -match [regex]::Escape($expectedProject) -and $runtime.firebase.databaseURL -notmatch 'cwh-timeclock')
    'Staging authentication domain'   = ($runtime.firebase.authDomain -match [regex]::Escape($expectedProject) -and $runtime.firebase.authDomain -notmatch 'cwh-timeclock')
    'Staging Firebase storage bucket' = ($runtime.firebase.storageBucket -match [regex]::Escape($expectedProject) -and $runtime.firebase.storageBucket -notmatch 'cwh-timeclock')
    'No production Leave API'         = (-not $runtime.leaveApiEndpoint -or $runtime.leaveApiEndpoint -match [regex]::Escape($expectedProject))
    'Worker has Firebase project'     = ($health.firebaseProjectConfigured -eq $true)
    'Worker has Firebase database'    = ($health.firebaseDatabaseConfigured -eq $true)
    'Worker has service account'      = ($health.membershipServiceConfigured -eq $true)
    'Worker has session secret'       = ($health.dedicatedSessionSecretConfigured -eq $true)
}

$failed = 0
foreach ($item in $checks.GetEnumerator()) {
    $label = if ($item.Value) { 'PASS' } else { 'FAIL' }
    if (-not $item.Value) { $failed++ }
    Write-Host ("{0}: {1}" -f $item.Key, $label)
}
if ($failed -gt 0) { throw "Local staging preflight failed: $failed checks. Do not perform any write tests." }
Write-Host 'Local runtime configuration checks passed.' -ForegroundColor Green
Write-Host 'Next: inspect Network calls and external integrations before writing staging data.' -ForegroundColor Yellow
