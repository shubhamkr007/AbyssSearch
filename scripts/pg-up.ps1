<#
.SYNOPSIS
  Start the local Postgres container (persistent named volume) and optionally
  apply Prisma migrations for S4 tenant-config.

.PARAMETER NoMigrate
  Skip `prisma migrate deploy` after the DB is healthy.

.PARAMETER Seed
  Also run the S4 seed script (demo ACME tenant + one API key printed once).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\pg-up.ps1
  powershell -ExecutionPolicy Bypass -File scripts\pg-up.ps1 -Seed
  powershell -ExecutionPolicy Bypass -File scripts\pg-up.ps1 -NoMigrate
#>
param(
  [switch]$NoMigrate,
  [switch]$Seed
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'lib\docker.ps1')
. (Join-Path $PSScriptRoot 'lib\wsl-keepalive.ps1')

$compose = Join-Path $root 'infra\docker-compose.yml'
$tconf = Join-Path $root 'services\tenant-config'
$dbUrl = $script:DefaultDatabaseUrl

Write-Host '=== Enterprise Search - Postgres up ===' -ForegroundColor Green
$mode = Initialize-Docker
Write-Host ("Docker mode: {0}" -f $mode) -ForegroundColor DarkGray

if ($mode -eq 'wsl') {
  # Keep the WSL VM awake so Docker Engine (and Postgres) are not idle-stopped.
  Start-WslKeepalive
  Write-Host 'WSL keepalive : on (prevents idle VM shutdown while Postgres runs)' -ForegroundColor DarkGray
}

Write-Host 'Starting es-postgres (volume: enterprise-search-pgdata)...' -ForegroundColor Cyan
Invoke-Compose -ComposeFile $compose -ComposeArgs @('up', '-d', 'postgres')

Write-Host 'Waiting for Postgres (Docker healthy + TCP 127.0.0.1:5432)...' -ForegroundColor Cyan
$ready = $false
for ($i = 0; $i -lt 90; $i++) {
  $health = ''
  try {
    if ($mode -eq 'wsl') {
      $health = (& wsl -e docker inspect -f '{{.State.Health.Status}}' es-postgres 2>$null | Out-String).Trim()
    } else {
      $health = (& docker inspect -f '{{.State.Health.Status}}' es-postgres 2>$null | Out-String).Trim()
    }
  } catch { $health = '' }
  $tcp = Test-PostgresReady -ComputerName '127.0.0.1' -Port 5432
  if ($health -eq 'healthy' -and $tcp) { $ready = $true; break }
  Start-Sleep -Seconds 1
}
if (-not $ready) {
  Write-Host 'Postgres did not become healthy. Last docker health status:' -ForegroundColor Yellow
  try {
    Invoke-Docker -DockerArgs @('inspect', '-f', '{{.State.Health.Status}}', 'es-postgres')
  } catch { }
  throw 'Postgres did not become ready on 127.0.0.1:5432 within 90s. If Docker runs only inside WSL, enable mirrored networking or set vmIdleTimeout=-1 in %UserProfile%\.wslconfig.'
}
Write-Host '  postgres     healthy (127.0.0.1:5432)' -ForegroundColor Green

# Ensure local .env points at the persistent DB (gitignored; UTF-8 no BOM —
# a BOM makes Node --env-file ignore PORT and fall back to 8000).
& (Join-Path $PSScriptRoot 'write-s4-env.ps1')

if (-not $NoMigrate) {
  Write-Host 'Applying Prisma migrations (S4)...' -ForegroundColor Cyan
  $env:DATABASE_URL = $dbUrl
  Push-Location $tconf
  try {
    # Ensure client is generated; migrate deploy is non-interactive (CI/prod-safe).
    pnpm exec prisma generate
    pnpm exec prisma migrate deploy
  } finally {
    Pop-Location
  }
  Write-Host '  schema       applied' -ForegroundColor Green
}

if ($Seed) {
  Write-Host 'Seeding demo ACME tenant...' -ForegroundColor Cyan
  $env:DATABASE_URL = $dbUrl
  Push-Location $tconf
  try {
    pnpm seed
  } finally {
    Pop-Location
  }
}

Write-Host ''
Write-Host 'Postgres is up with persistent storage.' -ForegroundColor Green
Write-Host "  DATABASE_URL = $dbUrl"
Write-Host '  Volume       = enterprise-search-pgdata  (survives container restart/remove)'
Write-Host '  Stop         = powershell -ExecutionPolicy Bypass -File scripts\pg-down.ps1'
Write-Host '  Wipe data    = powershell -ExecutionPolicy Bypass -File scripts\pg-down.ps1 -Wipe'
