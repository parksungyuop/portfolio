@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo [debug] starting desktop pet with console output...
"%LOCALAPPDATA%\Programs\Python\Python312\python.exe" main.py
echo.
echo [debug] exited with code %errorlevel%
pause
