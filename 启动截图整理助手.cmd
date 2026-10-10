@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "SCREENSHOT_PROJECT_ROOT=%~dp0"
set "TEMP=%~dp0data\temp"
set "TMP=%~dp0data\temp"
if not exist "%TEMP%" mkdir "%TEMP%"
if exist "%~dp0output\desktop\win-unpacked\ScreenshotOrganizer.exe" (
  start "" /D "%~dp0" "%~dp0output\desktop\win-unpacked\ScreenshotOrganizer.exe"
) else (
  if exist "%~dp0node_modules\electron\dist\electron.exe" (
    start "" /D "%~dp0" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
  ) else (
    echo 请先按照 README.md 准备运行环境。
    pause
  )
)
