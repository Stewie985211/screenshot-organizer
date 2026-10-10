$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
$taskToolsRoot = Join-Path $taskProjectRoot 'tools'
$taskRuntimeRoot = Join-Path $taskToolsRoot 'ollama'
if (Test-Path -LiteralPath (Join-Path $taskRuntimeRoot 'ollama.exe')) { Write-Output '本地运行环境已存在。打开软件后可点击“准备本地模型”。'; exit }
New-Item -ItemType Directory -Path $taskToolsRoot -Force | Out-Null
$taskJson = & curl.exe --ssl-no-revoke --silent --show-error --fail --connect-timeout 15 --max-time 45 'https://api.github.com/repos/ollama/ollama/releases/latest'
if ($LASTEXITCODE -ne 0) { throw '读取官方发行信息失败' }
$taskRelease = $taskJson | ConvertFrom-Json
$taskAsset = $taskRelease.assets | Where-Object name -EQ 'ollama-windows-amd64.zip'
if (-not $taskAsset -or $taskAsset.browser_download_url -notlike 'https://github.com/ollama/ollama/releases/download/*') { throw '官方发行地址不符合预期' }
$taskZip = Join-Path $taskToolsRoot 'ollama-windows-amd64.zip'
& curl.exe --ssl-no-revoke --location --fail --retry 3 --connect-timeout 15 --output $taskZip $taskAsset.browser_download_url
if ($LASTEXITCODE -ne 0) { throw '下载运行环境失败' }
if ($taskAsset.digest -notlike 'sha256:*') { throw '官方未提供压缩包校验值' }
if ((Get-FileHash -LiteralPath $taskZip -Algorithm SHA256).Hash.ToLowerInvariant() -ne $taskAsset.digest.Substring(7)) { throw '压缩包 SHA256 校验失败' }
New-Item -ItemType Directory -Path $taskRuntimeRoot -Force | Out-Null
tar.exe -xf $taskZip -C $taskRuntimeRoot
if ($LASTEXITCODE -ne 0) { throw '解压运行环境失败' }
Write-Output '本地运行环境已准备。打开软件，点击“准备本地模型”下载 qwen3-vl:4b-instruct。'
