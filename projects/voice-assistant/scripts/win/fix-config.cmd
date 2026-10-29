@echo off
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0fix-config.ps1" > "%~dp0ps.log" 2>&1
