#!/bin/bash

# Couleurs
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

clear
echo "========================================="
echo "   INSTALLATION - CamViewer MDL"
echo "========================================="
echo ""
echo "Cette installation nécessite une connexion internet."
echo "Après installation, l'application fonctionnera OFFLINE."
echo ""
read -p "Appuyez sur Entrée pour continuer..."

cd "$(dirname "$0")" || exit 1

echo ""
echo "Installation des dépendances..."
echo ""

npm install --legacy-peer-deps

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================="
    echo -e "${GREEN}   INSTALLATION TERMINÉE !${NC}"
    echo "========================================="
    echo ""
    echo "Vous pouvez maintenant lancer l'application SANS internet :"
    echo ""
    echo "1. Exécutez : ./serveur-local.sh"
    echo "2. Attendez l'ouverture du navigateur"
    echo "3. L'application sera sur http://localhost:3000"
    echo ""
else
    echo ""
    echo -e "${RED}[ERREUR] Installation échouée${NC}"
    echo ""
    echo "Vérifiez :"
    echo "- Connexion internet active"
    echo "- Node.js installé (https://nodejs.org/)"
    echo ""
fi

read -p "Appuyez sur Entrée pour fermer..."
