@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "UTSC_PYTHON=.venv-recovery\Scripts\python.exe"
if not exist "%UTSC_PYTHON%" set "UTSC_PYTHON=.venv\Scripts\python.exe"
if not exist "%UTSC_PYTHON%" (
  echo Local environment is missing. Follow README.md to install dependencies.
  if not defined UTSC_NO_PAUSE pause
  exit /b 1
)
echo Open http://127.0.0.1:8510 after the server starts.
"%UTSC_PYTHON%" -X utf8 run_local.py %*
if errorlevel 1 if not defined UTSC_NO_PAUSE pause
endlocal
