@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo [ERROR] Install Node.js 20.18+ first.& pause & exit /b 1)
if not exist node_modules (
  echo [HunterKit] Installing locked npm dependencies for the demo lab...
  call npm ci
  if errorlevel 1 (echo [ERROR] npm install failed.& pause & exit /b 1)
)
call npm run demo:lab
