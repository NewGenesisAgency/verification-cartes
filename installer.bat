@echo off
cls
echo =========================================
echo   INSTALLATION - CamViewer MDL
echo =========================================
echo.
echo Cette installation necessite une connexion internet.
echo Apres installation, l'application fonctionnera OFFLINE.
echo.
pause

cd /d "%~dp0"

echo.
echo Installation des dependances...
echo.

call npm install --legacy-peer-deps

if errorlevel 1 (
    echo.
    echo [ERREUR] Installation echouee
    echo.
    echo Verifiez :
    echo - Connexion internet active
    echo - Node.js installe (https://nodejs.org/)
    echo.
    pause
    exit /b 1
)

echo.
echo =========================================
echo   INSTALLATION TERMINEE !
echo =========================================
echo.
echo Vous pouvez maintenant lancer l'application SANS internet :
echo.
echo 1. Double-cliquez sur : serveur-local.bat
echo 2. Attendez l'ouverture du navigateur
echo 3. L'application sera sur http://localhost:3000
echo.
pause
