[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$StartPort = 3000,
  [ValidateRange(1, 65535)]
  [int]$EndPort = 3099
)

$ProgressPreference = "SilentlyContinue"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$expectedWebRoot = Join-Path $projectRoot "apps\web"

for ($port = $StartPort; $port -le $EndPort; $port++) {
  $listeners = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
  if ($listeners.Count -eq 0) {
    continue
  }

  $belongsToProject = $false
  foreach ($listener in $listeners) {
    $ownerProcessId = $listener.OwningProcess
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ownerProcessId" -ErrorAction SilentlyContinue
    if ($process -and $process.CommandLine -and
        $process.CommandLine.IndexOf($expectedWebRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
      $belongsToProject = $true
      break
    }
  }
  if (-not $belongsToProject) {
    continue
  }

  try {
    $response = Invoke-WebRequest `
      -Uri "http://127.0.0.1:$port/api/settings/providers" `
      -UseBasicParsing -TimeoutSec 2
    $payload = $response.Content | ConvertFrom-Json
    if ($response.StatusCode -eq 200 -and $payload.settings.providers.hotspots) {
      Write-Output $port
      exit 0
    }
  } catch { }
}
exit 1
