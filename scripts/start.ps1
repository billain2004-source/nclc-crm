# Starts the NCLC CRM backend (port 4000) and frontend (port 5173) in the background.
# Logs go to .\logs. Usage:  powershell -ExecutionPolicy Bypass -File scripts\start.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'C:\Users\billa\tools\node\node.exe' }
if (-not (Test-Path $node)) { throw 'Node.js not found. Install Node 18+ or set the path in scripts\start.ps1' }
if (-not (Test-Path "$root\.env")) { throw '.env missing: copy .env.example to .env and fill in DB credentials' }
New-Item -ItemType Directory -Force "$root\logs" | Out-Null

function Test-Port($p) { [bool](Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) }

if (Test-Port 4000) { Write-Host 'Backend already running on :4000' } else {
  Start-Process -FilePath $node -ArgumentList 'src/server.js' -WorkingDirectory "$root\backend" -WindowStyle Hidden `
    -RedirectStandardOutput "$root\logs\backend.log" -RedirectStandardError "$root\logs\backend.err.log"
}
if (Test-Port 5173) { Write-Host 'Frontend already running on :5173' } else {
  Start-Process -FilePath $node -ArgumentList 'node_modules/vite/bin/vite.js' -WorkingDirectory "$root\frontend" -WindowStyle Hidden `
    -RedirectStandardOutput "$root\logs\frontend.log" -RedirectStandardError "$root\logs\frontend.err.log"
}

$deadline = (Get-Date).AddSeconds(30)
while (-not ((Test-Port 4000) -and (Test-Port 5173)) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
if ((Test-Port 4000) -and (Test-Port 5173)) {
  Write-Host 'NCLC CRM is running:'
  Write-Host '  App: http://localhost:5173'
  Write-Host '  API: http://localhost:4000/api/health'
} else {
  Write-Warning 'A server did not start - check the files in .\logs'
  exit 1
}
