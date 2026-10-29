@echo off
rem Stops only the pet process (pythonw running this folder's main.py).
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='pythonw.exe'\" | Where-Object { $_.CommandLine -like '*claude-pet*main.py*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Desktop pet stopped.
