@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo [ERROR] Install Node.js 20.18+ first.& pause & exit /b 1)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>20||(major===20&&minor>=18)?0:1)"
if errorlevel 1 (echo [ERROR] Node.js 20.18 or newer is required.& pause & exit /b 1)
echo [1/5] Installing locked npm dependencies...
call npm ci
if errorlevel 1 goto failed
echo [2/5] Installing tested tool binaries and checking SHA-256...
call npm run download:tools
if errorlevel 1 goto failed
echo [3/5] Installing pinned Nuclei templates...
call npm run setup:templates
if errorlevel 1 goto failed
echo [4/5] Checking tools...
call npm run check:tools
if errorlevel 1 goto failed
echo [5/5] Checking attack template profiles...
call npm run check:attacks
if errorlevel 1 goto failed
echo Setup completed. Run START-HUNTERKIT.cmd. Chrome or Edge is needed for screenshots.
pause
exit /b 0
:failed
echo [ERROR] Setup is incomplete. Read the error above; do not treat missing tools as a clean scan.
pause
exit /b 1
