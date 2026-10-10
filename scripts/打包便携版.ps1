[CmdletBinding()]
param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$taskProjectRoot = Split-Path -Parent $PSScriptRoot
if ([IO.Path]::GetPathRoot($taskProjectRoot) -ine 'D:\') { throw '请在 D 盘项目目录中构建便携包。' }
Set-Location -LiteralPath $taskProjectRoot
if (-not $SkipBuild) {
    & pwsh -NoProfile -File (Join-Path $PSScriptRoot '构建.ps1')
    if ($LASTEXITCODE -ne 0) { throw '构建失败，未创建便携包。' }
}
$taskVersion = (Get-Content -LiteralPath (Join-Path $taskProjectRoot 'package.json') -Raw | ConvertFrom-Json).version
$taskBundleName = "ScreenshotOrganizer-v$taskVersion-windows-x64"
$taskReleaseRoot = Join-Path $taskProjectRoot 'output\releases'
$taskBundleRoot = Join-Path $taskReleaseRoot $taskBundleName
$taskZip = Join-Path $taskReleaseRoot "$taskBundleName.zip"
if ((Test-Path -LiteralPath $taskBundleRoot) -or (Test-Path -LiteralPath $taskZip)) { throw '本版本的发行目录或 ZIP 已存在，请先检查原产物。' }
$taskProgram = Join-Path $taskProjectRoot 'output\desktop\win-unpacked'
if (-not (Test-Path -LiteralPath (Join-Path $taskProgram 'ScreenshotOrganizer.exe'))) { throw '找不到已打包程序，请先构建。' }
New-Item -ItemType Directory -Path (Join-Path $taskBundleRoot 'output\desktop'), (Join-Path $taskBundleRoot 'scripts') -Force | Out-Null
Copy-Item -LiteralPath $taskProgram -Destination (Join-Path $taskBundleRoot 'output\desktop\win-unpacked') -Recurse
foreach ($taskFile in @('.screenshot-organizer-root', '启动截图整理助手.cmd', '准备识别环境.cmd', 'LICENSE', 'THIRD_PARTY_NOTICES.md')) {
    Copy-Item -LiteralPath (Join-Path $taskProjectRoot $taskFile) -Destination (Join-Path $taskBundleRoot $taskFile)
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '准备本地环境.ps1') -Destination (Join-Path $taskBundleRoot 'scripts\准备本地环境.ps1')
Copy-Item -LiteralPath (Join-Path $taskProjectRoot 'docs\windows-portable.md') -Destination (Join-Path $taskBundleRoot '使用说明.txt')
$env:PORTABLE_TASK_SOURCE = $taskProjectRoot
$env:PORTABLE_TASK_BUNDLE = $taskBundleRoot
@'
const fs=require('fs'),path=require('path'),{createRequire}=require('module');
const root=process.env.PORTABLE_TASK_SOURCE,bundle=process.env.PORTABLE_TASK_BUNDLE;
const fromRoot=createRequire(path.join(root,'package.json'));
const fromBuilder=createRequire(fromRoot.resolve('electron-builder'));
const fromApp=createRequire(fromBuilder.resolve('app-builder-lib'));
const asar=fromApp('@electron/asar');
const archive=path.join(bundle,'output/desktop/win-unpacked/resources/app.asar');
const files=asar.listPackage(archive);
for(const entry of files.filter(p=>/\/(LICENSE[^/]*|COPYING[^/]*|NOTICE[^/]*)$/i.test(p.replace(/\\/g,'/')))){
  const relative=entry.replace(/\\/g,'/').replace(/^\//,'');
  const out=path.join(bundle,'licenses',relative);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,asar.extractFile(archive,entry.replace(/^[/\\]/,'')));
}
if(!files.some(p=>p.replace(/\\/g,'/').endsWith('/react/LICENSE')))throw Error('Missing dependency license');
console.log('Dependency licenses retained');
'@ | node
if ($LASTEXITCODE -ne 0) { throw '第三方许可证提取失败。' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($taskBundleRoot, $taskZip, [IO.Compression.CompressionLevel]::Optimal, $true, [Text.Encoding]::UTF8)
$taskHash = (Get-FileHash -LiteralPath $taskZip -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $taskReleaseRoot 'SHA256SUMS.txt'), "$taskHash  $taskBundleName.zip`n", [Text.UTF8Encoding]::new($false))
[pscustomobject]@{ ZIP = $taskZip; Bytes = (Get-Item -LiteralPath $taskZip).Length; SHA256 = $taskHash }
