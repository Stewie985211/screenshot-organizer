[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
if ([IO.Path]::GetPathRoot($taskProjectRoot) -ine 'D:\') { throw '请先把整个软件文件夹解压到 D 盘。' }
$taskToolsRoot = Join-Path $taskProjectRoot 'tools'
$taskRuntimeRoot = Join-Path $taskToolsRoot 'ollama'
$taskRuntimeTag = 'v0.40.2'
$taskExpectedDigest = 'sha256:e29ad1d5063dd4b54b2492d9b00adab2cff9621bfa654b6c92aa8d6f1fdfe7fc'
if (-not $CheckOnly -and (Test-Path -LiteralPath (Join-Path $taskRuntimeRoot 'ollama.exe'))) { Write-Output '本地运行环境已存在。打开软件后可点击“准备本地模型”。'; exit }
$taskJson = & curl.exe --ssl-no-revoke --silent --show-error --fail --retry 2 --connect-timeout 15 --max-time 60 "https://api.github.com/repos/ollama/ollama/releases/tags/$taskRuntimeTag"
if ($LASTEXITCODE -ne 0) { throw '读取官方发行信息失败' }
$taskRelease = $taskJson | ConvertFrom-Json
$taskAsset = $taskRelease.assets | Where-Object name -EQ 'ollama-windows-amd64.zip'
if (-not $taskAsset -or $taskAsset.browser_download_url -ne "https://github.com/ollama/ollama/releases/download/$taskRuntimeTag/ollama-windows-amd64.zip" -or $taskAsset.digest -ne $taskExpectedDigest) { throw '官方发行地址或 SHA256 与已验证版本不一致' }
if ($CheckOnly) { [pscustomobject]@{ Version = $taskRuntimeTag; Bytes = $taskAsset.size; SHA256 = $taskExpectedDigest.Substring(7); URL = $taskAsset.browser_download_url } | ConvertTo-Json -Compress; exit }
New-Item -ItemType Directory -Path $taskToolsRoot -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $taskProjectRoot 'data\temp') -Force | Out-Null
$env:TEMP = Join-Path $taskProjectRoot 'data\temp'
$env:TMP = $env:TEMP
$taskZip = Join-Path $taskToolsRoot 'ollama-windows-amd64.zip'
Write-Output '首次准备需要下载约 1.4 GB 的本地识别环境，请保持网络连接。'
& curl.exe --ssl-no-revoke --location --fail --retry 3 --connect-timeout 15 --output $taskZip $taskAsset.browser_download_url
if ($LASTEXITCODE -ne 0) { throw '下载运行环境失败' }
if ($taskAsset.digest -notlike 'sha256:*') { throw '官方未提供压缩包校验值' }
if ((Get-FileHash -LiteralPath $taskZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskAsset.digest.Substring(7)) { throw '压缩包 SHA256 校验失败' }
New-Item -ItemType Directory -Path $taskRuntimeRoot -Force | Out-Null
tar.exe -xf $taskZip -C $taskRuntimeRoot
if ($LASTEXITCODE -ne 0) { throw '解压运行环境失败' }
if (-not (Test-Path -LiteralPath (Join-Path $taskRuntimeRoot 'ollama.exe'))) { throw '解压完成后没有找到识别环境，请重新准备。' }
Write-Output '本地运行环境已准备。打开软件，点击“准备本地模型”下载 qwen3-vl:4b-instruct。'
