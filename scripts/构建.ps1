$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $taskProjectRoot
$env:ELECTRON_CACHE = Join-Path $taskProjectRoot '.cache\electron'
$env:ELECTRON_BUILDER_CACHE = Join-Path $taskProjectRoot '.cache\builder'
$env:TEMP = Join-Path $taskProjectRoot '.cache\temp'
$env:TMP = $env:TEMP
node node_modules/typescript/bin/tsc -p tsconfig.main.json
if ($LASTEXITCODE -ne 0) { throw '主进程编译失败' }
node node_modules/typescript/bin/tsc -p tsconfig.renderer.json --noEmit
if ($LASTEXITCODE -ne 0) { throw '界面类型检查失败' }
node node_modules/vite/bin/vite.js build
if ($LASTEXITCODE -ne 0) { throw '界面构建失败' }
node node_modules/electron-builder/cli.js --win --x64 --dir
if ($LASTEXITCODE -ne 0) { throw '打包失败' }
