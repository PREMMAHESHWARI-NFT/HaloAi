@echo off
echo Starting HaloAI Desktop App...
echo.
cd /d "%~dp0"
start /b cmd /c "pnpm electron:dev"
echo Electron app started!
echo Press any key to stop the app...
pause >nul
taskkill /F /IM electron.exe /T >nul 2>&1
taskkill /F /IM node.exe /T >nul 2>&1
echo App stopped.
