# =====================================================================
#  Installeur borne - Verification des Cartes (Pass Region / MDL)
#  Installe : Node (si absent), dependances npm, .env.local, Ollama + modele IA.
#  Usage  : clic droit > Executer avec PowerShell  (ou double-clic sur install.bat)
#  Option : .\install.ps1 -NoOllama   (saute l'analyse IA / le gros telechargement)
# =====================================================================
param([switch]$NoOllama)

$ErrorActionPreference = 'Continue'
Set-Location -Path $PSScriptRoot

function Step($m) { Write-Host "`n=== $m ===" -ForegroundColor Cyan }
function Ok($m)   { Write-Host "  [OK] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "  [!] $m" -ForegroundColor Yellow }
function PauseEnd { try { Read-Host "Appuie sur Entree pour fermer" | Out-Null } catch {} }

Write-Host "==================================================================" -ForegroundColor Magenta
Write-Host "   Installation borne - Verification des Cartes" -ForegroundColor Magenta
Write-Host "==================================================================" -ForegroundColor Magenta

# --- 1. Node.js -------------------------------------------------------
Step "Node.js"
if (Get-Command node -ErrorAction SilentlyContinue) {
    Ok "Node $(node --version) present"
} else {
    Warn "Node.js absent - installation via winget..."
    winget install --id OpenJS.NodeJS.LTS -e --source winget --silent --accept-package-agreements --accept-source-agreements
    Warn "Node installe. FERME ce terminal, rouvre-le, puis relance install.bat."
    PauseEnd
    exit 1
}

# --- 2. Dependances npm ----------------------------------------------
Step "Dependances (npm install)"
npm install --legacy-peer-deps
if ($LASTEXITCODE -eq 0) { Ok "Dependances installees" } else { Warn "npm a renvoye le code $LASTEXITCODE (verifie ta connexion)" }

# --- 3. .env.local ----------------------------------------------------
Step "Configuration (.env.local)"
if (Test-Path ".env.local") {
    Ok ".env.local deja present - conserve"
} elseif (Test-Path ".env.example") {
    Copy-Item ".env.example" ".env.local"
    Warn ".env.local cree depuis le modele - RENSEIGNE tes cles Supabase dedans (URL + cle publishable)."
} else {
    Warn "Pas de .env.example - cree .env.local manuellement (voir README)."
}

# --- 4. Ollama (analyse IA) ------------------------------------------
if ($NoOllama) {
    Step "Ollama"
    Warn "Saute (option -NoOllama). L'analyse IA ne sera pas disponible."
} else {
    Step "Ollama (analyse IA)"
    $ollamaExe = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
    if (-not (Test-Path $ollamaExe)) {
        $c = Get-Command ollama -ErrorAction SilentlyContinue
        if ($c) { $ollamaExe = $c.Source }
    }
    if (-not (Test-Path $ollamaExe)) {
        Warn "Installation d'Ollama via winget..."
        winget install --id Ollama.Ollama -e --source winget --silent --accept-package-agreements --accept-source-agreements
        $ollamaExe = Join-Path $env:LOCALAPPDATA "Programs\Ollama\ollama.exe"
    } else {
        Ok "Ollama deja installe"
    }

    # CORS : autoriser le navigateur a appeler Ollama (persistant)
    setx OLLAMA_ORIGINS "*" | Out-Null
    $env:OLLAMA_ORIGINS = "*"
    Ok "OLLAMA_ORIGINS=* (CORS navigateur)"

    if (Test-Path $ollamaExe) {
        $up = $false
        try { Invoke-WebRequest "http://localhost:11434/api/version" -TimeoutSec 4 -UseBasicParsing | Out-Null; $up = $true } catch {}
        if (-not $up) {
            Start-Process -FilePath $ollamaExe -ArgumentList "serve" -WindowStyle Hidden
            Start-Sleep -Seconds 6
        }
        Ok "Serveur Ollama actif"

        Step "Telechargement du modele vision gemma3:4b (~3.3 Go, quelques minutes)"
        & $ollamaExe pull gemma3:4b
        if ($LASTEXITCODE -eq 0) { Ok "Modele gemma3:4b pret" } else { Warn "Echec du pull (reseau ?). Reessaie : ollama pull gemma3:4b" }
    } else {
        Warn "ollama.exe introuvable apres installation - relance le script."
    }
}

# --- Fin --------------------------------------------------------------
Write-Host "`n==================================================================" -ForegroundColor Magenta
Write-Host "   Installation terminee !" -ForegroundColor Green
Write-Host "==================================================================" -ForegroundColor Magenta
Write-Host "  1) Verifie .env.local (cles Supabase)" -ForegroundColor White
Write-Host "  2) Lance la borne :   npm run dev   puis   http://localhost:3000" -ForegroundColor White
Write-Host ""
PauseEnd
