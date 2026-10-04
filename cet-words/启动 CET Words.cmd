@echo off
setlocal
title CET Words
cd /d "%~dp0"

rem Node.js / npm location on this machine (edit NODE_DIR when moving to another PC)
set "NODE_DIR=C:\Users\Lenovo\.cache\nodejs-lts"
set "PATH=%NODE_DIR%;%PATH%"
if "%PORT%"=="" set "PORT=3100"

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found: %NODE_DIR%
  echo Edit NODE_DIR in this .cmd file if Node is installed elsewhere.
  pause
  exit /b 1
)

if not exist ".next\BUILD_ID" (
  echo First run: building the app, about 1 minute ...
  call node node_modules\next\dist\bin\next build
  if errorlevel 1 (
    echo [ERROR] Build failed. See the output above.
    pause
    exit /b 1
  )
)

echo.
echo   CET Words is starting ...
echo   Open in browser: http://localhost:%PORT%
echo   Close this window to quit (or press Ctrl+C).
echo.

if /i not "%~1"=="nobrowser" (
  start "" /b powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 4; Start-Process 'http://localhost:%PORT%'"
)

call node node_modules\next\dist\bin\next start -p %PORT%
pause
