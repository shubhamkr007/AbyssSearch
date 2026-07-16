<#
.SYNOPSIS
  Show the health of Elasticsearch and the four local stack services.

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
  @{ Name = 'tenant-config'; Url = 'http://localhost:8001/healthz' },
  @{ Name = 'search';        Url = 'http://localhost:8080/healthz' },
  @{ Name = 'gateway';       Url = 'http://localhost:8081/healthz' },
  @{ Name = 'ingestion';     Url = 'http://localhost:8090/healthz' }
)

Write-Host '=== Enterprise Search - status ===' -ForegroundColor Green
foreach ($t in $targets) {
  $state = Get-Health $t.Url
  $color = if ($state -like 'up*') { 'Green' } else { 'Red' }
  Write-Host ("  {0,-14} {1,-28} {2}" -f $t.Name, $t.Url, $state) -ForegroundColor $color
}
