#Requires -Version 5.1
<#
.SYNOPSIS
  调用本地 Web 服务的热点刷新接口（供 Windows 计划任务使用）。

.DESCRIPTION
  需要在运行 Web 的机器上配置环境变量：
  - HOTSPOT_REFRESH_TOKEN：与 apps/web 进程中的值一致
  - HOTSPOT_REFRESH_URL（可选）：默认 http://127.0.0.1:3000/api/hotspots

  示例计划任务：每天 8:00 与 14:00 各跑一次。
  未配置 token 时服务端会拒绝带 Bearer 的请求（401）。

.EXAMPLE
  $env:HOTSPOT_REFRESH_TOKEN = "your-secret"
  .\scripts\schedule-hotspot-refresh.ps1
#>

$ErrorActionPreference = "Stop"

$token = $env:HOTSPOT_REFRESH_TOKEN
if (-not $token -or -not $token.Trim()) {
  Write-Error "请先设置环境变量 HOTSPOT_REFRESH_TOKEN"
  exit 1
}

$url = $env:HOTSPOT_REFRESH_URL
if (-not $url -or -not $url.Trim()) {
  $url = "http://127.0.0.1:3000/api/hotspots"
}

$headers = @{
  Authorization = "Bearer $($token.Trim())"
  "Content-Type" = "application/json"
}

try {
  $response = Invoke-WebRequest -Method POST -Uri $url -Headers $headers -Body "{}" -UseBasicParsing
  Write-Host "热点刷新成功 HTTP $($response.StatusCode)"
  Write-Host $response.Content
  exit 0
} catch {
  if ($_.Exception.Response) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $body = $reader.ReadToEnd()
    Write-Error "热点刷新失败 HTTP $($_.Exception.Response.StatusCode.value__): $body"
  } else {
    Write-Error "热点刷新失败: $($_.Exception.Message)"
  }
  exit 1
}
