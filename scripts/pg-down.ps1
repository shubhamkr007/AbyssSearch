<#
.SYNOPSIS
  Stop the local Postgres container. Persistent data in the named volume is kept
  unless -Wipe is passed.

.PARAMETER Wipe
  Also remove the named volume `enterprise-search-pgdata` (DESTROYS all tenants/keys).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\pg-down.ps1
  powershell -ExecutionPolicy Bypass -File scripts\pg-down.ps1 -Wipe
#>
param(
  [switch]$Wipe
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'lib\docker.ps1')
. (Join-Path $PSScriptRoot 'lib\wsl-keepalive.ps1')

$compose = Join-Path $root 'infra\docker-compose.yml'

Write-Host '=== Enterprise Search - Postgres down ===' -ForegroundColor Green
$null = Initialize-Docker

if ($Wipe) {
  Write-Host 'Stopping Postgres AND deleting volume enterprise-search-pgdata...' -ForegroundColor Yellow
  Invoke-Compose -ComposeFile $compose -ComposeArgs @('down', '-v', '--remove-orphans')
  Stop-WslKeepalive
  Write-Host 'Postgres stopped; persistent data wiped.' -ForegroundColor Yellow
} else {
  Write-Host 'Stopping es-postgres (volume kept)...' -ForegroundColor Cyan
  # Stop only the postgres service; leave the named volume intact.
  Invoke-Compose -ComposeFile $compose -ComposeArgs @('stop', 'postgres')
  Invoke-Compose -ComposeFile $compose -ComposeArgs @('rm', '-f', 'postgres')
  Stop-WslKeepalive
  Write-Host 'Postgres stopped. Data preserved in volume enterprise-search-pgdata.' -ForegroundColor Green
  Write-Host '  Restart: powershell -ExecutionPolicy Bypass -File scripts\pg-up.ps1'
}
