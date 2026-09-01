[CmdletBinding()]
param(
  [switch]$InstallIfMissing,
  [ValidateRange(30, 900)]
  [int]$TimeoutSeconds = 240
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-StrictMode -Version Latest

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
$composeFile = Join-Path $projectRoot "docker-compose.rsshub.yml"
$rsshubHealthUrl = "http://127.0.0.1:1200/healthz"

function Resolve-DockerCli {
  $command = Get-Command docker -ErrorAction SilentlyContinue
  if ($command) {
    return $command.Source
  }

  $candidates = @(
    (Join-Path $env:ProgramFiles "Docker\Docker\resources\bin\docker.exe"),
    (Join-Path $env:LOCALAPPDATA "Docker\resources\bin\docker.exe")
  )
  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate) {
      return $candidate
    }
  }
  return $null
}

function Test-NativeCommand(
  [string]$FilePath,
  [string]$Arguments,
  [int]$TimeoutMilliseconds = 10000
) {
  $startInfo = [System.Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $FilePath
  $startInfo.Arguments = $Arguments
  $startInfo.UseShellExecute = $false
  $startInfo.CreateNoWindow = $true
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  $process = [System.Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  try {
    if (-not $process.Start()) {
      return $false
    }
    if (-not $process.WaitForExit($TimeoutMilliseconds)) {
      $process.Kill()
      return $false
    }
    return $process.ExitCode -eq 0
  } catch {
    return $false
  } finally {
    $process.Dispose()
  }
}

function Test-DockerEngine([string]$DockerCli) {
  return Test-NativeCommand $DockerCli "info" 10000
}

function Test-RsshubHealth {
  try {
    $response = Invoke-WebRequest -Uri $rsshubHealthUrl -UseBasicParsing -TimeoutSec 5
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 300
  } catch {
    return $false
  }
}

function Test-FeatureRestartPending {
  if (Test-Path -LiteralPath "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending") {
    return $true
  }
  if (Test-Path -LiteralPath "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired") {
    return $true
  }
  return $false
}

function Wait-Until([scriptblock]$Condition, [string]$ProgressMessage) {
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTime]::UtcNow -lt $deadline) {
    if (& $Condition) {
      return $true
    }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 3
  }
  Write-Host ""
  Write-Host $ProgressMessage -ForegroundColor Yellow
  return $false
}

function Test-WslAvailable {
  $wslPath = Join-Path $env:SystemRoot "System32\wsl.exe"
  if (-not (Test-Path -LiteralPath $wslPath)) {
    return $false
  }
  return Test-NativeCommand $wslPath "--status" 10000
}

function Ensure-WslAvailable {
  if (Test-WslAvailable) {
    return $true
  }

  $wslPath = Join-Path $env:SystemRoot "System32\wsl.exe"
  Write-Host "Docker Desktop 需要 WSL 2，正在启用（可能弹出权限窗口）..."
  try {
    $process = Start-Process -FilePath $wslPath `
      -ArgumentList @("--install", "--no-distribution") `
      -Verb RunAs -Wait -PassThru
    if ($process.ExitCode -ne 0) {
      return $false
    }
    return Test-WslAvailable
  } catch {
    Write-Host "WSL 2 启用失败：$($_.Exception.Message)" -ForegroundColor Yellow
    return $false
  }
}

function Install-DockerDesktop {
  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    Write-Host "未找到 winget，无法自动安装 Docker Desktop。" -ForegroundColor Yellow
    return $false
  }

  $wslReady = Ensure-WslAvailable
  Write-Host "首次运行：正在安装 Docker Desktop（可能弹出权限窗口，请点“是”）..."
  & $winget.Source install --exact --id Docker.DockerDesktop `
    --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Desktop 安装命令未成功完成。" -ForegroundColor Yellow
    return $false
  }
  if (-not $wslReady) {
    Write-Host "WSL 2 已启用，Windows 需要重启后才能启动 Docker Engine。" -ForegroundColor Yellow
  }
  return $true
}

if (-not (Test-Path -LiteralPath $composeFile)) {
  Write-Host "未找到 RSSHub 编排文件：$composeFile" -ForegroundColor Red
  exit 30
}

$dockerCli = Resolve-DockerCli
if (-not $dockerCli) {
  if (-not $InstallIfMissing) {
    Write-Host "未安装 Docker Desktop。" -ForegroundColor Yellow
    exit 20
  }
  if (-not (Install-DockerDesktop)) {
    exit 20
  }
  $dockerCli = Resolve-DockerCli
  if (-not $dockerCli) {
    Write-Host "Docker Desktop 已安装，但当前终端还未识别。请重启电脑后再双击启动。" -ForegroundColor Yellow
    exit 10
  }
}

if (-not (Test-DockerEngine $dockerCli)) {
  $desktopPath = Join-Path $env:ProgramFiles "Docker\Docker\Docker Desktop.exe"
  if (-not (Test-Path -LiteralPath $desktopPath)) {
    Write-Host "找到了 Docker 命令，但未找到 Docker Desktop。" -ForegroundColor Yellow
    exit 20
  }

  Write-Host "正在启动 Docker Desktop。首次启动时请在窗口中接受许可条款..."
  Start-Process -FilePath $desktopPath | Out-Null
  Write-Host -NoNewline "等待 Docker Engine"
  if (-not (Wait-Until { Test-DockerEngine $dockerCli } "Docker Engine 启动超时。")) {
    if (Test-FeatureRestartPending) {
      Write-Host "Windows 仍有系统组件更新等待重启；完成更新后可再次尝试。" -ForegroundColor Yellow
      exit 10
    }
    Write-Host "请打开 Docker Desktop 查看具体错误，再重新双击启动。" -ForegroundColor Yellow
    exit 20
  }
  Write-Host ""
}

Write-Host "正在核对并启动 RSSHub（首次会下载镜像，需联网）..."
$composeStarted = $false
for ($attempt = 1; $attempt -le 3; $attempt++) {
  & $dockerCli compose --project-name shipinhao-rsshub `
    --project-directory $projectRoot -f $composeFile up -d
  if ($LASTEXITCODE -eq 0) {
    $composeStarted = $true
    break
  }
  if ($attempt -lt 3) {
    Write-Host "Docker Engine 尚未稳定，等待后重试（$attempt/3）..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5
    [void](Wait-Until { Test-DockerEngine $dockerCli } "Docker Engine 暂时不可用。")
  }
}
if (-not $composeStarted) {
  Write-Host "RSSHub 容器启动失败。" -ForegroundColor Yellow
  exit 30
}

Write-Host -NoNewline "等待 RSSHub 健康检查"
if (-not (Wait-Until { Test-RsshubHealth } "RSSHub 健康检查超时。工作台仍可继续使用普通 RSS 源。")) {
  exit 30
}
Write-Host ""
Write-Host "RSSHub 已就绪：http://127.0.0.1:1200" -ForegroundColor Green
exit 0
