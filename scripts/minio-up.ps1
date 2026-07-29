<#
.SYNOPSIS
  Start the local MinIO container (S3-compatible) and bootstrap standard buckets.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\minio-up.ps1
#>
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
. (Join-Path $PSScriptRoot 'lib\docker.ps1')

$compose = Join-Path $root 'infra\docker-compose.yml'
$bootstrap = Join-Path $root 'infra\minio\bootstrap.ps1'

Write-Host '=== Enterprise Search - MinIO up ===' -ForegroundColor Green
$mode = Initialize-Docker
Write-Host ("Docker mode: {0}" -f $mode) -ForegroundColor DarkGray

Write-Host 'Starting es-minio (volume: enterprise-search-miniodata)...' -ForegroundColor Cyan
Invoke-Compose -ComposeFile $compose -ComposeArgs @('--profile', 'minio', 'up', '-d', 'minio')

& powershell.exe -ExecutionPolicy Bypass -File $bootstrap
if ($LASTEXITCODE -ne 0) { throw 'MinIO bootstrap failed' }

Write-Host ''
Write-Host 'MinIO is up.' -ForegroundColor Green
Write-Host '  API      = http://127.0.0.1:9000'
Write-Host '  Console  = http://127.0.0.1:9001  (minioadmin / minioadmin)'
Write-Host '  Buckets  = content, thumbnails, es-snapshots'
Write-Host '  Stop     = powershell -ExecutionPolicy Bypass -File scripts\minio-down.ps1'
