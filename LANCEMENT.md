# 🚀 Guide de Lancement - CamViewer MDL

## 📋 Première installation (avec internet)

### Windows
```bash
npm install --legacy-peer-deps
```

### Linux / macOS
```bash
npm install --legacy-peer-deps
```

**Une seule fois !** Après, plus besoin d'internet.

---

## ▶️ Lancement du serveur (sans internet)

### Windows
**Double-cliquez sur :** `serveur-local.bat`

Ou en ligne de commande :
```bash
serveur-local.bat
```

### Linux / macOS
**Dans le terminal :**
```bash
chmod +x serveur-local.sh
./serveur-local.sh
```

---

## 🌐 Accès à l'application

Une fois le serveur démarré :
- **URL :** http://localhost:3000
- Le navigateur s'ouvrira automatiquement après 5 secondes

---

## 🛑 Arrêter le serveur

Appuyez sur **Ctrl + C** dans la fenêtre du terminal

---

## ⚙️ Ce que font les scripts

1. ✅ Vérifient que les dépendances sont installées
2. ✅ Lancent le serveur Next.js en mode développement
3. ✅ Ouvrent automatiquement le navigateur
4. ✅ **Fonctionnent 100% OFFLINE** (après la première installation)

---

## 🔧 En cas de problème

### "Dependencies non installees"
Lancez une fois (avec internet) :
```bash
npm install --legacy-peer-deps
```

### Le port 3000 est déjà utilisé
Fermez les autres applications qui utilisent le port 3000, ou modifiez le port dans `package.json` :
```json
"scripts": {
  "dev": "next dev -p 3001"
}
```

### Permission denied (Linux/macOS)
```bash
chmod +x serveur-local.sh
```

---

## 📦 Structure

```
CamViewer/
├── serveur-local.bat    # Script Windows
├── serveur-local.sh     # Script Linux/macOS
├── package.json         # Configuration npm
├── node_modules/        # Dépendances (créé après npm install)
└── src/                 # Code source
```

---

## 🎯 Mode production (optionnel)

Pour un build optimisé :
```bash
npm run build
npm start
```

---

**Le serveur fonctionne maintenant en mode offline ! 🎉**
