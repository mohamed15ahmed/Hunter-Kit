@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul || (echo [ERROR] Node.js 20.18+ is required.& pause & exit /b 1)
where npm >nul 2>nul || (echo [ERROR] npm was not found.& pause & exit /b 1)
node -e "const [major,minor]=process.versions.node.split('.').map(Number);process.exit(major>20||(major===20&&minor>=18)?0:1)"
if errorlevel 1 (echo [ERROR] Node.js 20.18 or newer is required.& pause & exit /b 1)
if not exist .env copy .env.example .env >nul
if not exist node_modules (
  echo [HunterKit] Installing dependencies for the first run...
  call npm ci
  if errorlevel 1 (echo [ERROR] npm ci failed.& pause & exit /b 1)
)
if not exist projects mkdir projects
echo [HunterKit] Running quick diagnostics...
call npm run check:tools
if errorlevel 1 (echo [ERROR] Tool diagnostics failed. Run INSTALL-TOOLS.cmd.& pause & exit /b 1)
echo.
echo [HunterKit] Starting Web UI and local backend...
echo [HunterKit] Project data: %CD%\projects
echo [HunterKit] Open: http://127.0.0.1:5173
start "" cmd /c "timeout /t 4 /nobreak >nul & start http://127.0.0.1:5173"
call npm run dev
pause
