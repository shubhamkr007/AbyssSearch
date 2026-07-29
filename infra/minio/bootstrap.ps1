<#
.SYNOPSIS
  Wait for MinIO on :9000 and create the standard buckets (content, thumbnails, es-snapshots).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File infra\minio\bootstrap.ps1
#>
param(
  [string]$Endpoint = 'http://127.0.0.1:9000',
  [string]$AccessKey = 'minioadmin',
  [string]$SecretKey = 'minioadmin'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
. (Join-Path $root 'scripts\lib\docker.ps1') | Out-Null

Write-Host '=== Enterprise Search - MinIO bootstrap ===' -ForegroundColor Green

# Prefer native mc if available; else run via docker against the compose network.
function Test-MinioReady {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri "$Endpoint/minio/health/live" -TimeoutSec 2
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

Write-Host "Waiting for MinIO at $Endpoint ..." -ForegroundColor Cyan
$ok = $false
for ($i = 0; $i -lt 60; $i++) {
  if (Test-MinioReady) { $ok = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $ok) { throw "MinIO did not become ready at $Endpoint within 60s" }
Write-Host '  MinIO        healthy' -ForegroundColor Green

$buckets = @('content', 'thumbnails', 'es-snapshots')

# Use a one-shot minio/mc container (works for both native + WSL docker).
$mode = Initialize-Docker
Write-Host ("Docker mode: {0}" -f $mode) -ForegroundColor DarkGray

# From inside the compose network the API is reachable as http://minio:9000;
# from the host we already verified :9000. mc alias uses the host-published port
# via host.docker.internal when possible; fall back to the service name.
$aliasEndpoint = 'http://host.docker.internal:9000'
$mcScript = @"
mc alias set local $aliasEndpoint $AccessKey $SecretKey
"@
foreach ($b in $buckets) {
  $mcScript += "`nmc mb --ignore-existing local/$b"
}

try {
  Invoke-Docker -DockerArgs @(
    'run', '--rm',
    '--add-host=host.docker.internal:host-gateway',
    'minio/mc:latest',
    'sh', '-c', $mcScript
  )
} catch {
  # WSL/older docker may lack host-gateway; retry against the compose service name
  # by attaching to the enterprise-search network.
  Write-Host 'Retrying bucket bootstrap via compose network...' -ForegroundColor DarkGray
  $mcScript2 = @"
mc alias set local http://minio:9000 $AccessKey $SecretKey
"@
  foreach ($b in $buckets) {
    $mcScript2 += "`nmc mb --ignore-existing local/$b"
  }
  Invoke-Docker -DockerArgs @(
    'run', '--rm',
    '--network', 'enterprise-search_default',
    'minio/mc:latest',
    'sh', '-c', $mcScript2
  )
}

Write-Host ("Buckets ready: {0}" -f ($buckets -join ', ')) -ForegroundColor Green
Write-Host '  API          http://127.0.0.1:9000'
Write-Host '  Console      http://127.0.0.1:9001  (minioadmin / minioadmin)'
