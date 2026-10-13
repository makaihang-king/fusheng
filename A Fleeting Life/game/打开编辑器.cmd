@echo off
chcp 65001 >nul
cd /d "%~dp0"
start "" "..\需要的软件\CocosCreator\3.8.8\CocosCreator.exe" --project "%cd%"
