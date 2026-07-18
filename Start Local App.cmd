@echo off
setlocal
cd /d "%~dp0"

set "NODE_EXE=node"
where node >nul 2>nul
if errorlevel 1 set "NODE_EXE=C:\Users\Senthil\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"

if not exist "%NODE_EXE%" (
  where "%NODE_EXE%" >nul 2>nul
  if errorlevel 1 (
    echo Node.js could not be found. Open this project in Codex and ask it to start the local app.
    pause
    exit /b 1
  )
)

start "" "http://localhost:4173"
"%NODE_EXE%" scripts\local-server.mjs

echo.
echo The local app has stopped.
pause
