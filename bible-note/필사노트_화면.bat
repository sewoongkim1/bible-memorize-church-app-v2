@echo off
rem Bible note maker UI - double click to open (http://127.0.0.1:8770)
rem Picks a Python that really runs: "where python" also finds the Microsoft Store
rem stub (WindowsApps\python.exe) which only prints an install hint - so test it.
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set "PY="
py -3 -c "import sys" >nul 2>nul && set "PY=py -3"
if not defined PY (
  python -c "import sys" >nul 2>nul && set "PY=python"
)
if not defined PY (
  echo Python 3 was not found. Install it from https://www.python.org and run this again.
  pause
  exit /b 1
)
%PY% ui.py
if errorlevel 1 pause
