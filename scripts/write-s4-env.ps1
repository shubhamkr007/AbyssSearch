$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$path = Join-Path $root 'services\tenant-config\.env'
$dbUrl = 'postgresql://tenant_config:tenant_config@127.0.0.1:5432/tenant_config?schema=public'
$content = @"
PORT=8001
DATABASE_URL=$dbUrl
REDIS_URL=
ADMIN_TOKEN=dev-admin-token
USE_IN_MEMORY=false
LOG_LEVEL=warn
"@
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($path, $content.Trim() + "`n", $utf8NoBom)
Write-Host "Wrote $path (UTF-8 no BOM)"
