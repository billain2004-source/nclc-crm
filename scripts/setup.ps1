# One-time developer setup for NCLC CRM (Windows PowerShell).
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1            # install + create .env
#   powershell -ExecutionPolicy Bypass -File scripts\setup.ps1 -InitDb    # ...and create + seed the database
# Steps: check Node/npm -> npm ci (backend, frontend) -> create .env from .env.example with generated
# JWT_SECRET and APP_ENC_KEY (never overwrites values you already set) -> optionally run db:setup.
# The MySQL password is never generated or printed: you type it into .env yourself.
param([switch]$InitDb)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node -and (Test-Path 'C:\Users\billa\tools\node\node.exe')) { $node = 'C:\Users\billa\tools\node\node.exe'; $env:Path = 'C:\Users\billa\tools\node;' + $env:Path }
if (-not $node) { throw 'Node.js 18+ is required: install it from https://nodejs.org and re-run this script.' }
$ver = & $node -p 'process.versions.node'
if ([int]($ver.Split('.')[0]) -lt 18) { throw "Node.js 18+ is required (found $ver)." }
Write-Host "Node $ver found."

foreach ($dir in 'backend', 'frontend') {
  Write-Host "Installing $dir dependencies (npm ci)..."
  Push-Location (Join-Path $root $dir)
  try { npm ci --no-audit --no-fund; if ($LASTEXITCODE -ne 0) { throw "npm ci failed in $dir" } } finally { Pop-Location }
}

$envFile = Join-Path $root '.env'
function New-Secret { & $node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" }
if (-not (Test-Path $envFile)) {
  Copy-Item (Join-Path $root '.env.example') $envFile
  Write-Host 'Created .env from .env.example'
}
$lines = Get-Content $envFile
$changed = $false
$lines = $lines | ForEach-Object {
  if ($_ -match '^JWT_SECRET=(|change-me.*)$') { $changed = $true; "JWT_SECRET=$(New-Secret)" }
  elseif ($_ -match '^APP_ENC_KEY=$') { $changed = $true; "APP_ENC_KEY=$(New-Secret)" }
  else { $_ }
}
if (-not ($lines -match '^APP_ENC_KEY=')) { $changed = $true; $lines += "APP_ENC_KEY=$(New-Secret)" }
if ($changed) { [IO.File]::WriteAllLines($envFile, [string[]]$lines); Write-Host 'Generated JWT_SECRET / APP_ENC_KEY in .env (back up APP_ENC_KEY: stored API keys need it).' }

$dbUser = ($lines | Where-Object { $_ -match '^DB_USER=' }) -replace '^DB_USER=', ''
$dbPassLine = $lines | Where-Object { $_ -match '^DB_PASSWORD=' }
if ($InitDb) {
  Write-Host 'Creating and seeding the database (npm run db:setup)...'
  Push-Location (Join-Path $root 'backend')
  try { npm run db:setup; if ($LASTEXITCODE -ne 0) { throw 'db:setup failed - check DB_* values in .env and that MySQL is running' } } finally { Pop-Location }
} else {
  Write-Host ''
  Write-Host 'Next steps:'
  Write-Host "  1. Edit .env and set DB_HOST / DB_PORT / DB_USER (now '$dbUser') / DB_PASSWORD$(if ($dbPassLine -eq 'DB_PASSWORD=') { ' (currently empty)' })."
  Write-Host '  2. cd backend; npm run db:setup      # creates the database from schema.sql and loads demo data'
  Write-Host '  3. powershell -ExecutionPolicy Bypass -File scripts\start.ps1'
}
Write-Host 'Setup finished. App: http://localhost:5173  API: http://localhost:4000/api/health'
