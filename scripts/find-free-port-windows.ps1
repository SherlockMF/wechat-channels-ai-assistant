[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$StartPort = 3000,
  [ValidateRange(1, 65535)]
  [int]$EndPort = 3099
)

$ErrorActionPreference = "Stop"

for ($port = $StartPort; $port -le $EndPort; $port++) {
  if (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue) {
    continue
  }
  $listener = [System.Net.Sockets.TcpListener]::new(
    [System.Net.IPAddress]::Any,
    $port
  )
  try {
    $listener.Start()
    $listener.Stop()
    Write-Output $port
    exit 0
  } catch {
    try { $listener.Stop() } catch { }
  }
}

Write-Error "在 $StartPort-$EndPort 范围内没有可用端口。"
exit 1
