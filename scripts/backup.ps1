# Creates a code + documents backup zip in .\backups (git-ignored).
# Included: backend/, frontend/, documents/, scripts/, README.md, .env.example, .gitignore,
#           plus a live DB export: database/db_schema.sql + database/db_data.sql.
# Excluded: node_modules, .env (DB password, JWT secret, APP_ENC_KEY), logs, build output (dist),
#           .git, earlier backups, and ALL API key data (api_keys / api_key_usage_log rows are never exported).
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\backup.ps1 [-NoDatabase]
param([switch]$NoDatabase)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { $node = 'C:\Users\billa\tools\node\node.exe' }

$stamp = Get-Date -Format 'yyyyMMdd-HHmm'
$name = "nclc-crm-backup-$stamp"
$stage = Join-Path ([IO.Path]::GetTempPath()) $name
$outDir = Join-Path $root 'backups'
$zip = Join-Path $outDir "$name.zip"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage, $outDir | Out-Null

# Code + documents (robocopy exit codes below 8 mean success)
$excludeDirs = @('node_modules', 'dist', 'logs', '.git', 'backups', '.vite', 'coverage')
$excludeFiles = @('.env', '.env.local', '.env.*.local', '*.log', '*.zip', '*.pem', '*.key')
foreach ($dir in 'backend', 'frontend', 'documents', 'scripts') {
  robocopy (Join-Path $root $dir) (Join-Path $stage $dir) /E /NFL /NDL /NJH /NJS /NP /XD $excludeDirs /XF $excludeFiles | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Copy of $dir failed (robocopy $LASTEXITCODE)" }
}
foreach ($f in 'README.md', '.env.example', '.gitignore') { Copy-Item (Join-Path $root $f) $stage }

# Database schema + data (no API key data)
if (-not $NoDatabase) {
  Push-Location (Join-Path $root 'backend')
  try {
    & $node scripts/export-sql.js (Join-Path $stage 'database')
    if ($LASTEXITCODE -ne 0) { throw 'Database export failed' }
  } finally { Pop-Location }
}

# Safety net: refuse to zip anything that looks like secrets
$bad = Get-ChildItem $stage -Recurse -Force | Where-Object { $_.Name -eq '.env' -or $_.FullName -match '\\node_modules\\|\\logs\\|\\dist\\' }
if ($bad) { throw "Backup staging contains excluded files: $($bad.FullName -join ', ')" }
$hits = Get-ChildItem $stage -Recurse -File -Include *.sql, *.js, *.jsx, *.json, *.md, *.ps1 |
  Select-String -Pattern '^APP_ENC_KEY=[0-9a-fA-F]{16,}', 'v1:[A-Za-z0-9+/=]{12,}:[A-Za-z0-9+/=]{12,}:' -List
if ($hits) { throw "Possible secret found in backup: $($hits.Path -join ', ')" }

Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
Remove-Item -Recurse -Force $stage
$size = [math]::Round((Get-Item $zip).Length / 1KB)
Write-Host "Backup created: $zip ($size KB)"
