#!/bin/bash

# Couleurs
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

clear
echo "========================================="
echo "  SERVEUR LOCAL MDL - Lycée Branly"
echo "========================================="
echo ""
echo -e "${BLUE}> Le site sera accessible sur : http://localhost:3000${NC}"
echo -e "${BLUE}> Appuyez sur Ctrl+C pour arrêter le serveur${NC}"
echo ""

# Aller dans le dossier du script
cd "$(dirname "$0")" || exit 1

# Vérifier si node_modules existe
if [ ! -d "node_modules" ]; then
    echo -e "${RED}✗ Dépendances non installées !${NC}"
    echo ""
    echo "Pour la première installation, exécutez :"
    echo -e "${YELLOW}npm install --legacy-peer-deps${NC}"
    echo ""
    echo "Ensuite, relancez ce fichier."
    echo ""
    read -p "Appuyez sur Entrée pour fermer..."
    exit 1
fi

# Vérifier si .next existe
if [ ! -d ".next" ]; then
    echo -e "${YELLOW}[INFO] Premier démarrage, création du build de développement...${NC}"
    echo ""
fi

echo -e "${GREEN}✓ Dépendances installées${NC}"
echo -e "${GREEN}✓ Mode offline - Pas besoin d'internet${NC}"
echo ""
echo "Démarrage du serveur Next.js..."
echo ""
sleep 2

# Ouvrir le navigateur après 5 secondes en arrière-plan
(
    sleep 5
    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        open http://localhost:3000
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Linux
        xdg-open http://localhost:3000 2>/dev/null || sensible-browser http://localhost:3000 2>/dev/null
    fi
) &

# Démarrer le serveur Next.js en mode développement
npm run dev

# Si le serveur s'arrête
echo ""
echo "Serveur arrêté."
read -p "Appuyez sur Entrée pour fermer..."
