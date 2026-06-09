@echo off
cls
echo =========================================
echo   SERVEUR LOCAL MDL - Lycee Branly
echo =========================================
echo.
echo ^> Le site sera accessible sur : http://localhost:3000
echo ^> Appuyez sur Ctrl+C pour arreter le serveur
echo.

cd /d "%~dp0"

REM Verifier si node_modules existe
if not exist "node_modules" (
    echo [ATTENTION] Dependencies non installees !
    echo.
    echo Pour la premiere installation, executez :
    echo npm install --legacy-peer-deps
    echo.
    echo Ensuite, relancez ce fichier.
    echo.
    pause
    exit /b 1
)

REM Verifier si .next existe (build necessaire)
if not exist ".next" (
    echo [INFO] Premier demarrage, creation du build de developpement...
    echo.
)

echo [OK] Dependencies installees
echo [OK] Mode offline - Pas besoin d'internet
echo.
echo Demarrage du serveur Next.js...
echo.
timeout /t 2 /nobreak >nul

REM Ouvrir le navigateur apres 5 secondes
start /B cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:3000"

REM Demarrer le serveur Next.js en mode developpement
call npm run dev

if errorlevel 1 (
    echo.
    echo [ERREUR] Le serveur n'a pas pu demarrer
    echo.
    pause
    exit /b 1
)

pause
