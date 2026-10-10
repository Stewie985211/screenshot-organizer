@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "SCREENSHOT_PROJECT_ROOT=%~dp0"
set "TEMP=%~dp0data\temp"
set "TMP=%~dp0data\temp"
if not exist "%TEMP%" mkdir "%TEMP%"
start "" /D "%~dp0" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0"
