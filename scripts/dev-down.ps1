<#
.SYNOPSIS
  Stop the local Enterprise Search stack: kill whatever is listening on the
  stack ports, then close the service windows launched by dev-up.ps1.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dev-down.ps1
#>
param()

$ErrorActionPreference = 'SilentlyContinue'
$ports = 8000, 8001, 8080, 8081, 8090, 8092
$stopped = $false

Write-Host '=== Enterprise Search - dev down ===' -ForegroundColor Green

# 1) Stop the servers by the ports they listen on (kills node / uvicorn).
foreach ($p in $ports) {
  $procIds = Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($procId in $procIds) {
    if (-not $procId) { continue }
    $name = (Get-Process -Id $procId -ErrorAction SilentlyContinue).ProcessName
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Write-Host ("  stopped :{0,-5} PID {1} ({2})" -f $p, $procId, $name) -ForegroundColor Yellow
    $stopped = $true
  }
}

# 2) Close the host windows we launched (recorded in the pidfile).
$pidFile = Join-Path $PSScriptRoot '.dev-pids.json'
if (Test-Path $pidFile) {
  $hostPids = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
  foreach ($hp in $hostPids) {
    if (Get-Process -Id $hp -ErrorAction SilentlyContinue) {
      Stop-Process -Id $hp -Force -ErrorAction SilentlyContinue
      $stopped = $true
    }
  }
  Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
}

# 3) Fallback: close any leftover windows by their title (es-*).
Get-Process -Name powershell -ErrorAction SilentlyContinue |
  Where-Object { $_.MainWindowTitle -like 'es-*' } |
  ForEach-Object {
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    Write-Host ("  closed window '{0}'" -f $_.MainWindowTitle) -ForegroundColor Yellow
    $stopped = $true
  }

if (-not $stopped) {
  Write-Host 'Nothing to stop - no stack services were running on 8000/8001/8080/8081/8090/8092.' -ForegroundColor Green
} else {
  Write-Host 'Stack stopped.' -ForegroundColor Green
}
