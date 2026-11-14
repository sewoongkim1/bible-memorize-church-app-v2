@echo off
rem Bible note maker UI - double click to open (http://127.0.0.1:8770)
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
where python >nul 2>nul
if %errorlevel%==0 (
  python ui.py
) else (
  py -3 ui.py
)
if errorlevel 1 pause
