# Stops whatever is listening on the NCLC CRM ports (4000 backend, 5173 frontend).
foreach ($port in 4000, 5173) {
  $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
  if (-not $conns) { Write-Host "Nothing listening on :$port"; continue }
  foreach ($procId in ($conns.OwningProcess | Sort-Object -Unique)) {
    $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
    if ($p -and $p.ProcessName -eq 'node') {
      Stop-Process -Id $procId -Force
      Write-Host "Stopped node (PID $procId) on :$port"
    } elseif ($p) {
      Write-Warning "Port $port is used by $($p.ProcessName) (PID $procId) - not a node process, left running"
    }
  }
}
