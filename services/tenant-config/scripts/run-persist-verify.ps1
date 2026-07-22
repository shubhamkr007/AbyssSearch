$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)

function Wait-Ready([int]$TimeoutSec = 60) {
  for ($i = 0; $i -lt $TimeoutSec; $i++) {
    try {
      $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8001/readyz' -TimeoutSec 2
      if ($r.StatusCode -eq 200) { return $true }
    } catch { }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Stop-Port([int]$Port) {
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique |
    ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}

# Free both the intended port and the default Nest port (if .env was misread).
Stop-Port 8001
Stop-Port 8000
$logOut = Join-Path $PWD 's4-verify.out.log'
$logErr = Join-Path $PWD 's4-verify.err.log'
Remove-Item $logOut, $logErr -Force -ErrorAction SilentlyContinue

Write-Host 'Starting S4...' -ForegroundColor Cyan
$proc = Start-Process -FilePath 'node' -ArgumentList '--env-file=.env','dist/main.js' `
  -RedirectStandardOutput $logOut -RedirectStandardError $logErr -PassThru -WindowStyle Hidden

if (-not (Wait-Ready 60)) {
  Write-Host '---- S4 stderr ----' -ForegroundColor Yellow
  if (Test-Path $logErr) { Get-Content $logErr -Tail 40 }
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  throw 'S4 /readyz never became 200'
}
Write-Host 'S4 ready' -ForegroundColor Green

$created = node --env-file=.env scripts/persist-smoke.mjs create
Write-Host "created: $created"
$tenantId = ($created | ConvertFrom-Json).id

Write-Host 'Restarting S4 process...' -ForegroundColor Cyan
Stop-Process -Id $proc.Id -Force
Start-Sleep -Seconds 1
Stop-Port 8001
Remove-Item $logOut, $logErr -Force -ErrorAction SilentlyContinue
$proc2 = Start-Process -FilePath 'node' -ArgumentList '--env-file=.env','dist/main.js' `
  -RedirectStandardOutput $logOut -RedirectStandardError $logErr -PassThru -WindowStyle Hidden

if (-not (Wait-Ready 60)) {
  Write-Host '---- S4 stderr ----' -ForegroundColor Yellow
  if (Test-Path $logErr) { Get-Content $logErr -Tail 40 }
  Stop-Process -Id $proc2.Id -Force -ErrorAction SilentlyContinue
  throw 'S4 did not become ready after restart'
}

node --env-file=.env scripts/persist-smoke.mjs check $tenantId
if ($LASTEXITCODE -ne 0) {
  Stop-Process -Id $proc2.Id -Force -ErrorAction SilentlyContinue
  throw 'Tenant missing after S4 restart'
}

Write-Host ''
Write-Host 'API PERSISTENCE OK — tenant survived S4 process restart (Postgres volume).' -ForegroundColor Green
Write-Host "tenantId=$tenantId"
Write-Host "S4 still running on :8001 (PID $($proc2.Id))"
