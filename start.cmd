@echo off
rem  Double-click this to run the sight reading app.
rem
rem  It serves this folder on localhost and opens it in your browser. Web MIDI needs a
rem  "secure context", and localhost always counts as one, so this is the reliable way in.
rem  Leave this black window open while you play. Closing it stops the app.

cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Python is not installed, so this folder cannot be served.
  echo   Install it from python.org, then double-click this file again.
  echo.
  pause
  exit /b 1
)

echo.
echo   Serving "piano sight reading" at http://localhost:8733/
echo   Leave this window open while you play. Close it to stop.
echo.

start "" http://localhost:8733/
python -m http.server 8733
