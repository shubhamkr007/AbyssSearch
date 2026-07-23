<#
.SYNOPSIS
  Show the health of Elasticsearch and the local stack services.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dev-status.ps1
#>
param()

function Get-Health([string]$Url) {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3
    return "up ($([int]$r.StatusCode))"
  } catch {
    return 'down'
  }
}

$targets = @(
  @{ Name = 'elasticsearch'; Url = 'http://localhost:9200' },
  @{ Name = 'analysis-ml';   Url = 'http://localhost:8000/healthz' },
  @{ Name = 'tenant-config'; Url = 'http://localhost:8001/readyz' },
  @{ Name = 'search';        Url = 'http://localhost:8080/healthz' },
  @{ Name = 'gateway';       Url = 'http://localhost:8081/healthz' },
  @{ Name = 'ingestion';     Url = 'http://localhost:8090/healthz' },
  @{ Name = 'rag';           Url = 'http://localhost:8092/healthz' },
  @{ Name = 'analytics';     Url = 'http://localhost:8093/healthz' }
)

Write-Host '=== Enterprise Search - status ===' -ForegroundColor Green
foreach ($t in $targets) {
  $state = Get-Health $t.Url
  $color = if ($state -like 'up*') { 'Green' } else { 'Red' }
  Write-Host ("  {0,-14} {1,-28} {2}" -f $t.Name, $t.Url, $state) -ForegroundColor $color
}

# Postgres port probe (Docker container used by -RealConfig).
try {
  $client = New-Object System.Net.Sockets.TcpClient
  $iar = $client.BeginConnect('localhost', 5432, $null, $null)
  $ok = $iar.AsyncWaitHandle.WaitOne([TimeSpan]::FromSeconds(2))
  if ($ok) { $client.EndConnect($iar) }
  $client.Close()
  $pg = if ($ok) { 'up (tcp)' } else { 'down' }
} catch { $pg = 'down' }
$pgColor = if ($pg -like 'up*') { 'Green' } else { 'DarkGray' }
Write-Host ("  {0,-14} {1,-28} {2}" -f 'postgres', 'localhost:5432', $pg) -ForegroundColor $pgColor
