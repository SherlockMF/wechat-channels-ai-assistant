[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^https?://")]
  [string]$Url,
  [ValidateRange(10, 600)]
  [int]$TimeoutSeconds = 120
)

$ProgressPreference = "SilentlyContinue"

$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
while ([DateTime]::UtcNow -lt $deadline) {
  try {
    $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      Start-Process $Url
      exit 0
    }
  } catch {
    Start-Sleep -Seconds 2
  }
}
exit 1
