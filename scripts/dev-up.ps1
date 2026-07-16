<#
.SYNOPSIS
  Start the local Enterprise Search stack, each service in its own window so they
  survive independently (a crash in one does not take down the others).

  Services & ports:
    analysis-ml (embedding + NER) : 8000
    tenant-config S4 (-RealConfig): 8001   (in-memory store; no Postgres needed)
    search-service                : 8080
    api-gateway (BFF)             : 8081   <- point the widget's api-base here
    ingestion (orchestrator)      : 8090

  Elasticsearch is expected to already be running on :9200 (you run it natively).

.PARAMETER Embeddings
  Also load the embedding model in analysis-ml so search is hybrid (BM25 + kNN).
  Default is NER-only (BACKEND=none); search then runs BM25-only, which is the
  known-good low-resource mode.

.PARAMETER RealConfig
  Start the real S4 tenant/config service (in-memory store) on :8001 and point the
  gateway at it (real API-key auth + per-tenant config) instead of the seeded fake
  config. In-memory state is not persisted across restarts; provision tenants/keys
  via the S4 admin API (see scripts\verify-gaps.ps1).

.PARAMETER Build
  Force a rebuild of the Node services before starting.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1
  powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Embeddings
  powershell -ExecutionPolicy Bypass -File scripts\dev-up.ps1 -Embeddings -RealConfig
#>
param(
  [switch]$Embeddings,
  [switch]$RealConfig,
  [switch]$Build
)

$ErrorActionPreference = 'Stop'
$root      = Split-Path -Parent $PSScriptRoot
$analysis  = Join-Path $root 'services\analysis-ml'
$tconf     = Join-Path $root 'services\tenant-config'
$search    = Join-Path $root 'services\search-service'
$gateway   = Join-Path $root 'services\api-gateway'
$ingest    = Join-Path $root 'services\ingestion'

function Test-Http([string]$Url) {
  try { Invoke-WebRequest -UseBasicParsing -Uri $Url -TimeoutSec 3 | Out-Null; return $true }
  catch { return $false }
}

function Start-Svc {
  param(
    [string]$Title,
    [string]$WorkDir,
    [hashtable]$EnvVars,
    [string]$RunCmd
  )
  $envPrefix = ($EnvVars.GetEnumerator() | ForEach-Object { "`$env:$($_.Key)='$($_.Value)'" }) -join '; '
  $full = "$envPrefix; `$Host.UI.RawUI.WindowTitle='$Title'; Set-Location -LiteralPath '$WorkDir'; Write-Host '[$Title] starting...' -ForegroundColor Cyan; $RunCmd"
  $proc = Start-Process -FilePath 'powershell.exe' -ArgumentList '-NoExit', '-Command', $full -PassThru
  return $proc.Id
}

Write-Host '=== Enterprise Search - dev up ===' -ForegroundColor Green

# --- Preflight: Elasticsearch ---
if (Test-Http 'http://localhost:9200') {
  Write-Host 'Elasticsearch : up on :9200' -ForegroundColor Green
} else {
  Write-Host 'Elasticsearch : NOT reachable on :9200 - start it first (search + ingestion need it).' -ForegroundColor Yellow
}

# --- Build Node services if needed ---
$nodeReady = (Test-Path (Join-Path $search 'dist\main.js')) -and (Test-Path (Join-Path $gateway 'dist\main.js'))
if ($RealConfig) { $nodeReady = $nodeReady -and (Test-Path (Join-Path $tconf 'dist\main.js')) }
if ($Build -or -not $nodeReady) {
  Write-Host 'Building Node services...' -ForegroundColor Cyan
  try {
    pnpm --filter @enterprise-search/search-service build
    pnpm --filter @enterprise-search/api-gateway build
    if ($RealConfig) { pnpm --filter @enterprise-search/tenant-config build }
  } catch {
    Write-Host "Build failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host 'Fix the build, or run once manually with pnpm, then retry.' -ForegroundColor Yellow
    exit 1
  }
}

# --- Launch services (each in its own window) ---
$backend = if ($Embeddings) { 'sentence-transformers' } else { 'none' }
$warm    = if ($Embeddings) { 'true' } else { 'false' }
if (-not $Embeddings) {
  Write-Host 'analysis-ml   : NER-only (pass -Embeddings for hybrid search).' -ForegroundColor DarkGray
}

$pids = @()
$pids += Start-Svc -Title 'es-analysis-ml' -WorkDir $analysis -EnvVars @{
  PORT = '8000'; BACKEND = $backend; WARM_UP = $warm; SPACY_MODEL = 'en_core_web_sm'; LOG_LEVEL = 'INFO'
} -RunCmd "& '.\.venv\Scripts\python.exe' -m uvicorn app.main:app --port 8000"

if ($RealConfig) {
  Write-Host 'config        : real S4 on :8001 (in-memory store).' -ForegroundColor DarkGray
  $pids += Start-Svc -Title 'es-tenant-config' -WorkDir $tconf -EnvVars @{
    PORT = '8001'; USE_IN_MEMORY = 'true'; ADMIN_TOKEN = 'dev-admin-token'; REDIS_URL = ''; LOG_LEVEL = 'info'
  } -RunCmd 'node dist\main.js'
} else {
  Write-Host 'config        : seeded fake config (pass -RealConfig for real S4).' -ForegroundColor DarkGray
}

$pids += Start-Svc -Title 'es-search' -WorkDir $search -EnvVars @{
  PORT = '8080'; USE_FAKE = 'false'; ELASTICSEARCH_URL = 'http://localhost:9200'; EMBEDDING_SERVICE_URL = 'http://localhost:8000'; LOG_LEVEL = 'info'
} -RunCmd 'node dist\main.js'

$gatewayEnv = @{
  PORT = '8081'; USE_FAKE_SEARCH = 'false'; SEARCH_SERVICE_URL = 'http://localhost:8080'; RAG_ENABLED = 'false'; LOG_LEVEL = 'info'
}
if ($RealConfig) {
  $gatewayEnv['USE_FAKE_CONFIG'] = 'false'
  $gatewayEnv['CONFIG_SERVICE_URL'] = 'http://localhost:8001'
} else {
  $gatewayEnv['USE_FAKE_CONFIG'] = 'true'
}
$pids += Start-Svc -Title 'es-gateway' -WorkDir $gateway -EnvVars $gatewayEnv -RunCmd 'node dist\main.js'

$pids += Start-Svc -Title 'es-ingestion' -WorkDir $ingest -EnvVars @{
  PORT = '8090'; USE_FAKE = 'false'; USE_INLINE = 'true'; ELASTICSEARCH_URL = 'http://localhost:9200'; NER_SERVICE_URL = 'http://localhost:8000'; EMBEDDING_SERVICE_URL = 'http://localhost:8000'; ADMIN_TOKEN = 'dev-admin-token'; DATABASE_URL = 'sqlite+pysqlite:///./ingestion.db'; LOG_LEVEL = 'info'
} -RunCmd "& '.\.venv\Scripts\python.exe' -m uvicorn app.main:app --port 8090"

# Record host window PIDs so dev-down can close the windows precisely.
$pidFile = Join-Path $PSScriptRoot '.dev-pids.json'
$pids | ConvertTo-Json | Set-Content -LiteralPath $pidFile -Encoding UTF8

# --- Wait for health ---
$targets = @(
  @{ Name = 'analysis-ml'; Url = 'http://localhost:8000/healthz'; Timeout = 90 }
)
if ($RealConfig) {
  $targets += @{ Name = 'tenant-config'; Url = 'http://localhost:8001/healthz'; Timeout = 30 }
}
$targets += @(
  @{ Name = 'search';      Url = 'http://localhost:8080/healthz'; Timeout = 30 },
  @{ Name = 'gateway';     Url = 'http://localhost:8081/healthz'; Timeout = 30 },
  @{ Name = 'ingestion';   Url = 'http://localhost:8090/healthz'; Timeout = 30 }
)
Write-Host ''
Write-Host 'Waiting for services to become healthy...' -ForegroundColor Cyan
foreach ($t in $targets) {
  $ok = $false
  for ($i = 0; $i -lt $t.Timeout; $i++) {
    if (Test-Http $t.Url) { $ok = $true; break }
    Start-Sleep -Seconds 1
  }
  if ($ok) { Write-Host ("  {0,-12} healthy" -f $t.Name) -ForegroundColor Green }
  else     { Write-Host ("  {0,-12} not responding yet - check its window" -f $t.Name) -ForegroundColor Yellow }
}

Write-Host ''
Write-Host 'Stack up. Endpoints:' -ForegroundColor Green
Write-Host '  analysis-ml : http://localhost:8000/docs'
if ($RealConfig) { Write-Host '  tenant-cfg  : http://localhost:8001        (real S4, admin token = dev-admin-token)' }
Write-Host '  search      : http://localhost:8080/healthz'
Write-Host '  gateway     : http://localhost:8081        (widget api-base)'
Write-Host '  ingestion   : http://localhost:8090/docs'
Write-Host ''
if ($RealConfig) {
  Write-Host 'Real config is empty on start. Provision tenants + keys and verify hybrid/isolation:' -ForegroundColor Cyan
  Write-Host '  powershell -ExecutionPolicy Bypass -File scripts\verify-gaps.ps1'
} else {
  Write-Host 'Demo search through the gateway (tenant key = pk_test_demo):' -ForegroundColor Cyan
  Write-Host '  curl -X POST http://localhost:8081/v1/search -H "Authorization: Bearer pk_test_demo" -H "Content-Type: application/json" -d "{\"query\":\"security\"}"'
}
Write-Host ''
Write-Host 'Status:  powershell -ExecutionPolicy Bypass -File scripts\dev-status.ps1'
Write-Host 'Stop:    powershell -ExecutionPolicy Bypass -File scripts\dev-down.ps1'
