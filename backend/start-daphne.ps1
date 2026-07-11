# Start Generation Bread backend with Daphne (ASGI) for stable WebSockets
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$venvActivate = @(
  (Join-Path $PSScriptRoot "venv\Scripts\Activate.ps1"),
  (Join-Path (Split-Path $PSScriptRoot -Parent) ".venv\Scripts\Activate.ps1")
) | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($venvActivate) {
  . $venvActivate
}

$port = if ($env:PORT) { $env:PORT } else { "8000" }
# Use 0.0.0.0 for Docker/Render; 127.0.0.1 for local-only
$hostBind = if ($env:DAPHNE_BIND) { $env:DAPHNE_BIND } else { "127.0.0.1" }

Write-Host "Starting Daphne (ASGI) on http://${hostBind}:${port}" -ForegroundColor Green
if ($env:REDIS_URL) {
  Write-Host "Redis channel layer: ENABLED (multi-instance ready)" -ForegroundColor Green
} else {
  Write-Host "Redis channel layer: OFF (InMemory — single process only)" -ForegroundColor Yellow
}
Write-Host "WebSockets: ws://${hostBind}:${port}/ws/..." -ForegroundColor DarkGray
Write-Host "Health: http://${hostBind}:${port}/api/health/" -ForegroundColor DarkGray
daphne -b $hostBind -p $port spylt_backend.asgi:application
