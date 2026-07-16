<#
.SYNOPSIS
  Verify the two closed Phase-1 gaps against a running stack started with
  `dev-up.ps1 -Embeddings -RealConfig`:
    1. Hybrid search  - a semantic query (no shared keywords) returns the right
       doc via kNN, and the response is NOT degraded (embeddings were used).
    2. Tenant isolation - a key for tenant A cannot see tenant B's documents.

  It provisions two fresh tenants (acme, globex) in the in-memory S4, issues real
  API keys, ingests per-tenant docs (with embeddings + NER), then asserts.

  Requires a freshly started in-memory S4 (tenants must not pre-exist).

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts\verify-gaps.ps1
#>
param(
  [string]$AdminToken = 'dev-admin-token',
  [string]$S4 = 'http://localhost:8001',
  [string]$Gateway = 'http://localhost:8081',
  [string]$Ingest = 'http://localhost:8090',
  [string]$Es = 'http://localhost:9200'
)

$ErrorActionPreference = 'Stop'
$script:fails = 0
$adminHdr = @{ Authorization = "Bearer $AdminToken" }

function Check([string]$Name, [bool]$Ok, [string]$Detail = '') {
  if ($Ok) { Write-Host ("  PASS  {0}" -f $Name) -ForegroundColor Green }
  else { Write-Host ("  FAIL  {0}  {1}" -f $Name, $Detail) -ForegroundColor Red; $script:fails++ }
}

function New-Tenant([string]$Name, [string]$Prefix) {
  $body = @"
{ "name": "$Name", "prefix": "$Prefix" }
"@
  try {
    return Invoke-RestMethod -Uri "$S4/tenants" -Method Post -Headers $adminHdr -ContentType 'application/json' -Body $body
  } catch {
    $code = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
    if ($code -eq 409) {
      throw "Tenant prefix '$Prefix' already exists. Restart the in-memory S4 first: scripts\dev-down.ps1 ; scripts\dev-up.ps1 -Embeddings -RealConfig ; then re-run this script."
    }
    throw
  }
}

function New-Key([string]$TenantId) {
  $body = @"
{ "scopes": ["search","suggest"], "originAllowlist": [], "rateLimit": 1000 }
"@
  (Invoke-RestMethod -Uri "$S4/tenants/$TenantId/keys" -Method Post -Headers $adminHdr -ContentType 'application/json' -Body $body).key
}

function Set-Tabs([string]$TenantId) {
  $body = @"
{ "tabs": [ { "tabKey":"all","label":"All","position":0 }, { "tabKey":"documents","label":"Documents","position":1 } ] }
"@
  Invoke-RestMethod -Uri "$S4/tenants/$TenantId/tabs" -Method Put -Headers $adminHdr -ContentType 'application/json' -Body $body | Out-Null
}

function Invoke-Ingest([string]$Json) {
  $r = Invoke-RestMethod -Uri "$Ingest/jobs/ingest" -Method Post -Headers $adminHdr -ContentType 'application/json' -Body $Json
  Invoke-RestMethod -Uri "$Ingest/jobs/$($r.jobId)" -Method Get -Headers $adminHdr
}

function Search-Gw([string]$Key, [string]$Query) {
  $body = @"
{ "query": "$Query" }
"@
  Invoke-RestMethod -Uri "$Gateway/v1/search" -Method Post -Headers @{ Authorization = "Bearer $Key" } -ContentType 'application/json' -Body $body
}

Write-Host '=== verify-gaps: hybrid search + tenant isolation ===' -ForegroundColor Green

# --- 1) Provision two tenants + real API keys -----------------------------
$acme = New-Tenant 'ACME Corp' 'acme'
$globex = New-Tenant 'Globex Corp' 'globex'
$acmeKey = New-Key $acme.id
$globexKey = New-Key $globex.id
Set-Tabs $acme.id
Set-Tabs $globex.id
function Mask([string]$k) { if ($k.Length -gt 12) { $k.Substring(0, 12) + '...' } else { '***' } }
Write-Host "  acme   tenant=$($acme.id)  key=$(Mask $acmeKey)"
Write-Host "  globex tenant=$($globex.id)  key=$(Mask $globexKey)"

# --- 2) Ingest per-tenant docs (tenantId = prefix so the tenant_id filter matches).
# ACME includes a "rocket" doc that shares NO keywords with the semantic probe below.
$acmeDocs = @"
{ "tenantId":"acme","tenantPrefix":"acme","options":{"chunk":true,"enrich":true,"ensure_index":true},
  "documents":[
    {"title":"Rocket Launch Schedule","body":"Our Falcon vehicle will lift off from the coastal pad next Tuesday, carrying a communications satellite into orbit for a long-duration mission.","tags":["space"],"source":"document","natural_key":"acme-rocket"},
    {"title":"Quarterly Financial Summary","body":"ACME Corp revenue grew across the European market, with the Berlin office signing new enterprise contracts this quarter.","tags":["finance"],"source":"document","natural_key":"acme-finance"},
    {"title":"Office Coffee Policy","body":"The break room espresso machine is cleaned every Friday. Please rinse your cup and report faults to facilities.","tags":["office"],"source":"document","natural_key":"acme-coffee"}
  ] }
"@
$globexDocs = @"
{ "tenantId":"globex","tenantPrefix":"globex","options":{"chunk":true,"enrich":true,"ensure_index":true},
  "documents":[
    {"title":"Globex Annual Report","body":"Globex Corporation announced record profits led by its Springfield chemical division and expanding logistics network.","tags":["finance"],"source":"document","natural_key":"globex-annual"},
    {"title":"Zenith Product Manual","body":"The Zenith 3000 blender includes a pulse mode, dishwasher-safe jar, and a two-year warranty.","tags":["product"],"source":"document","natural_key":"globex-zenith"},
    {"title":"Holiday Schedule","body":"Globex offices will close for the winter holidays from December 24 through January 2, reopening on the first business day.","tags":["hr"],"source":"document","natural_key":"globex-holiday"}
  ] }
"@

$j1 = Invoke-Ingest $acmeDocs
$j2 = Invoke-Ingest $globexDocs
Check 'acme ingest succeeded'   ($j1.status -in @('succeeded', 'partial') -and $j1.counts.ok -ge 3) "status=$($j1.status) ok=$($j1.counts.ok)"
Check 'globex ingest succeeded' ($j2.status -in @('succeeded', 'partial') -and $j2.counts.ok -ge 3) "status=$($j2.status) ok=$($j2.counts.ok)"

# Make sure the new docs are searchable immediately.
try { Invoke-RestMethod -Uri "$Es/acme-*,globex-*/_refresh" -Method Post | Out-Null } catch {}
Start-Sleep -Milliseconds 600

# --- 3) Hybrid search (embeddings on) -------------------------------------
# "spacecraft blastoff timetable" shares no tokens with the rocket doc, so BM25
# alone returns nothing; only vector search can surface it.
$h = Search-Gw $acmeKey 'spacecraft blastoff timetable'
$titles = ($h.results | ForEach-Object { $_.title }) -join ' | '
Check 'hybrid: response not degraded (embeddings used)' (-not $h.degraded) "degraded=$($h.degraded)"
Check 'hybrid: semantic query returns results'          ($h.total -ge 1) "total=$($h.total)"
Check 'hybrid: rocket doc surfaced by meaning'          ($titles -match 'Rocket Launch') "top=$titles"

# --- 4) Tenant isolation --------------------------------------------------
# NOTE: with hybrid on, the kNN leg always returns the nearest vectors *within
# the tenant*, so a foreign keyword still returns the tenant's own docs. Real
# isolation = no foreign-tenant document ever appears in the results.
$acmeTitles = @('Rocket Launch Schedule', 'Quarterly Financial Summary', 'Office Coffee Policy')
$globexTitles = @('Globex Annual Report', 'Zenith Product Manual', 'Holiday Schedule')
function Titles($resp) { @($resp.results | ForEach-Object { $_.title }) }
function HasAny($titles, $set) { foreach ($t in $titles) { if ($set -contains $t) { return $true } } return $false }

$a1 = Titles (Search-Gw $acmeKey 'Falcon')
Check 'acme sees its own doc (Rocket Launch Schedule)' ($a1 -contains 'Rocket Launch Schedule') "titles=$($a1 -join ', ')"
# Probe with globex-only terms; acme must never receive a globex document.
$a2 = Titles (Search-Gw $acmeKey 'Zenith blender warranty Globex chemical')
Check 'acme CANNOT see any globex document' (-not (HasAny $a2 $globexTitles)) "titles=$($a2 -join ', ')"

$g1 = Titles (Search-Gw $globexKey 'Zenith')
Check 'globex sees its own doc (Zenith Product Manual)' ($g1 -contains 'Zenith Product Manual') "titles=$($g1 -join ', ')"
# Probe with acme-only terms; globex must never receive an acme document.
$g2 = Titles (Search-Gw $globexKey 'Falcon rocket satellite espresso')
Check 'globex CANNOT see any acme document' (-not (HasAny $g2 $acmeTitles)) "titles=$($g2 -join ', ')"

Write-Host ''
if ($script:fails -eq 0) {
  Write-Host 'ALL CHECKS PASSED - hybrid search + tenant isolation verified.' -ForegroundColor Green
} else {
  Write-Host ("{0} CHECK(S) FAILED" -f $script:fails) -ForegroundColor Red
  exit 1
}
