# Keep the WSL VM awake while Docker Engine (and Postgres) run inside it.
# Without this, WSL can idle-shut down and take containers with it.

$script:KeepalivePidFile = Join-Path $PSScriptRoot '..\.wsl-keepalive.pid'

function Start-WslKeepalive {
  if (-not (Get-Command wsl -ErrorAction SilentlyContinue)) { return }
  $pidFile = $script:KeepalivePidFile
  if (Test-Path $pidFile) {
    $existing = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue
    if ($existing -and (Get-Process -Id $existing -ErrorAction SilentlyContinue)) {
      return
    }
  }
  # Lightweight loop so the WSL distro is not considered idle.
  $proc = Start-Process -FilePath 'wsl.exe' -ArgumentList @(
    '-e', 'sh', '-c',
    'while true; do sleep 25; done'
  ) -WindowStyle Hidden -PassThru
  Set-Content -LiteralPath $pidFile -Value $proc.Id -Encoding ASCII
}

function Stop-WslKeepalive {
  $pidFile = $script:KeepalivePidFile
  if (-not (Test-Path $pidFile)) { return }
  $existing = Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue
  if ($existing) {
    Stop-Process -Id $existing -Force -ErrorAction SilentlyContinue
  }
  Remove-Item -LiteralPath $pidFile -ErrorAction SilentlyContinue
}
