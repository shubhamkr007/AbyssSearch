<#
.SYNOPSIS
  Stop the local MinIO container. Data is kept in the named volume unless -Wipe.

.PARAMETER Wipe
  Also delete the enterprise-search-miniodata volume.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\minio-down.ps1
  powershell -ExecutionPolicy Bypass -File scripts\minio-down.ps1 -Wipe
#>
param([switch]$Wipe)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'lib\docker.ps1')

$compose = Join-Path $root 'infra\docker-compose.yml'

Write-Host '=== Enterprise Search - MinIO down ===' -ForegroundColor Green
Initialize-Docker | Out-Null

Write-Host 'Stopping es-minio...' -ForegroundColor Cyan
try {
  Invoke-Compose -ComposeFile $compose -ComposeArgs @('--profile', 'minio', 'stop', 'minio')
  Invoke-Compose -ComposeFile $compose -ComposeArgs @('--profile', 'minio', 'rm', '-f', 'minio')
} catch {
  Write-Host ("  (stop note: {0})" -f $_.Exception.Message) -ForegroundColor DarkGray
}

if ($Wipe) {
  Write-Host 'Removing volume enterprise-search-miniodata...' -ForegroundColor Yellow
  try {
    Invoke-Docker -DockerArgs @('volume', 'rm', '-f', 'enterprise-search-miniodata')
  } catch {
    Write-Host ("  (volume note: {0})" -f $_.Exception.Message) -ForegroundColor DarkGray
  }
  Write-Host 'MinIO stopped and volume wiped.' -ForegroundColor Green
} else {
  Write-Host 'MinIO stopped. Data preserved in volume enterprise-search-miniodata.' -ForegroundColor Green
  Write-Host '  Restart: powershell -ExecutionPolicy Bypass -File scripts\minio-up.ps1'
}
