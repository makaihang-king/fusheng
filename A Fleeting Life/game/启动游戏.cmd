@echo off
chcp 65001 >nul
cd /d "%~dp0"
node scripts\build.cjs
if errorlevel 1 (
  pause
  exit /b 1
)
node scripts\launch.cjs
if errorlevel 1 pause
