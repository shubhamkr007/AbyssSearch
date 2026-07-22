# Shared helpers for locating Docker (native Windows or WSL) and running compose.

$script:DockerMode = $null  # 'native' | 'wsl'

function ConvertTo-WslPath {
  param([Parameter(Mandatory)][string]$WinPath)
  $full = $WinPath
  if (-not [System.IO.Path]::IsPathRooted($full)) {
    $full = (Resolve-Path -LiteralPath $full).Path
  } else {
    # Normalize even if the path does not exist yet (compose file parent may).
    $full = [System.IO.Path]::GetFullPath($full)
  }
  if ($full -match '^([A-Za-z]):\\(.*)$') {
    $drive = $Matches[1].ToLowerInvariant()
    $rest = ($Matches[2] -replace '\\', '/')
    return "/mnt/$drive/$rest"
  }
  return $full
}

function Initialize-Docker {
  if ($script:DockerMode) { return $script:DockerMode }

  if (Get-Command docker -ErrorAction SilentlyContinue) {
    try {
      & docker info 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) {
        $script:DockerMode = 'native'
        return $script:DockerMode
      }
    } catch { }
  }

  if (Get-Command wsl -ErrorAction SilentlyContinue) {
    $which = & wsl -e sh -c 'command -v docker' 2>$null
    if ($LASTEXITCODE -eq 0 -and $which) {
      & wsl -e docker info 2>$null | Out-Null
      if ($LASTEXITCODE -eq 0) {
        $script:DockerMode = 'wsl'
        return $script:DockerMode
      }
    }
  }

  throw @"
Docker is not available.

Install one of:
  - Docker Engine inside WSL2 (recommended, zero-cost)
  - Podman Desktop / Rancher Desktop with a docker-compatible CLI

Then retry. On Windows without docker.exe on PATH, this project uses: wsl docker ...
"@
}

function Invoke-Docker {
  param(
    [Parameter(Mandatory)][string[]]$DockerArgs
  )
  $mode = Initialize-Docker
  if ($mode -eq 'native') {
    & docker @DockerArgs
    if ($LASTEXITCODE -ne 0) { throw "docker $($DockerArgs -join ' ') failed (exit $LASTEXITCODE)" }
  } else {
    & wsl -e docker @DockerArgs
    if ($LASTEXITCODE -ne 0) { throw "wsl docker $($DockerArgs -join ' ') failed (exit $LASTEXITCODE)" }
  }
}

function Invoke-Compose {
  param(
    [Parameter(Mandatory)][string]$ComposeFile,
    [Parameter(Mandatory)][string[]]$ComposeArgs
  )
  $mode = Initialize-Docker
  if ($mode -eq 'native') {
    & docker compose -f $ComposeFile @ComposeArgs
    if ($LASTEXITCODE -ne 0) { throw "docker compose failed (exit $LASTEXITCODE)" }
  } else {
    $wslFile = ConvertTo-WslPath $ComposeFile
    & wsl -e docker compose -f $wslFile @ComposeArgs
    if ($LASTEXITCODE -ne 0) { throw "wsl docker compose failed (exit $LASTEXITCODE)" }
  }
}

function Test-PostgresReady {
  param([string]$ComputerName = 'localhost', [int]$Port = 5432, [int]$TimeoutSec = 2)
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $iar = $client.BeginConnect($ComputerName, $Port, $null, $null)
    $ok = $iar.AsyncWaitHandle.WaitOne([TimeSpan]::FromSeconds($TimeoutSec))
    if (-not $ok) { $client.Close(); return $false }
    $client.EndConnect($iar)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

# Default DATABASE_URL matching infra/docker-compose.yml
# Use 127.0.0.1 (not localhost) so Node/Prisma on Windows hits IPv4. Docker port
# publishes from WSL are often IPv4-only; localhost can resolve to ::1 first.
$script:DefaultDatabaseUrl = 'postgresql://tenant_config:tenant_config@127.0.0.1:5432/tenant_config?schema=public'
