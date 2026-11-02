@echo off
setlocal
cd /d "%~dp0"
set "PORT=8770"
set "URL=http://127.0.0.1:%PORT%/"

echo Starting Sad Match server on %URL%
echo.

where node >nul 2>nul
if not errorlevel 1 (
  start "Sad Match Server" cmd /k "node scripts\serve.mjs %PORT%"
  timeout /t 1 /nobreak >nul
  start "" "%URL%"
  echo Server started with Node.js. Close the "Sad Match Server" window to stop it.
  exit /b 0
)

py -3 --version >nul 2>nul
if not errorlevel 1 (
  start "Sad Match Server" cmd /k "py -3 -m http.server %PORT% --bind 127.0.0.1 --directory app"
  timeout /t 1 /nobreak >nul
  start "" "%URL%"
  echo Server started with Python. Close the "Sad Match Server" window to stop it.
  exit /b 0
)

where python >nul 2>nul
if not errorlevel 1 (
  start "Sad Match Server" cmd /k "python -m http.server %PORT% --bind 127.0.0.1 --directory app"
  timeout /t 1 /nobreak >nul
  start "" "%URL%"
  echo Server started with Python. Close the "Sad Match Server" window to stop it.
  exit /b 0
)

echo.
echo Node.js or Python 3 was not found.
echo Install Node.js LTS: https://nodejs.org/
echo or Python 3: https://www.python.org/downloads/
echo.
echo Then run this file again, or run manually:
echo   node scripts\serve.mjs
echo   py -3 -m http.server 8770 --bind 127.0.0.1 --directory app
echo.
pause
