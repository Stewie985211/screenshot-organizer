@echo off
chcp 65001 >nul
cd /d "%~dp0"
if /I not "%~d0"=="D:" (
  echo 请先把整个软件文件夹解压到 D 盘，再运行此文件。
  pause
  exit /b 1
)
echo 首次下载识别环境可能需要一段时间，请保持网络连接。
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\准备本地环境.ps1"
if errorlevel 1 (
  echo 准备失败。请检查上方错误信息和网络连接后重试。
  pause
  exit /b 1
)
echo 准备完成。请打开截图整理助手，在“本地识别”中点击“准备本地模型”。
pause
