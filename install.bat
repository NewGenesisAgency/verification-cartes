@echo off
REM Lanceur de l'installeur (double-clic). Contourne la policy d'execution PowerShell.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
