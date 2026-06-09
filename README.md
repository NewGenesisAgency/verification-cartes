# Vérification des Cartes — Pass Région / MDL

Application de **contrôle d'accès par scan de carte** pour la Maison des Lycéens.
Une borne lit la **carte Pass Région** d'un élève (QR code, code-barres ou nom)
et indique en temps réel si l'accès est **autorisé ou refusé**, avec historique
et statistiques.

- **Reconnaissance** : QR code + PDF417 (dos de carte) + OCR du nom + **analyse IA** (modèle vision local).
- **Backend** : Supabase (base élèves, historique, comptes, temps réel multi-bornes).
- **100 % utilisable hors-ligne** une fois installé (sauf l'analyse IA qui a besoin d'Ollama local).

---

## Sommaire
1. [Prérequis](#1-prérequis)
2. [Installation](#2-installation)
3. [Configuration (`.env.local`)](#3-configuration-envlocal)
4. [Lancer l'application](#4-lancer-lapplication)
5. [Connexion & comptes](#5-connexion--comptes)
6. [Base de données Supabase](#6-base-de-données-supabase)
7. [Analyse IA avec Ollama (optionnel)](#7-analyse-ia-avec-ollama-optionnel)
8. [Importer la base élèves (Excel)](#8-importer-la-base-élèves-excel)
9. [Utilisation au quotidien](#9-utilisation-au-quotidien)
10. [Plusieurs bornes](#10-plusieurs-bornes)
11. [Dépannage](#11-dépannage)
12. [Stack technique](#12-stack-technique)

---

## 1. Prérequis

- **Node.js 18.18+** (testé jusqu'à Node 25). [nodejs.org](https://nodejs.org)
- **npm** (fourni avec Node).
- **Git** (pour cloner).
- *(Optionnel)* **Ollama** pour l'analyse IA — voir [section 7](#7-analyse-ia-avec-ollama-optionnel).
- Un **projet Supabase** (déjà créé : « MDL »). Pour repartir de zéro, voir [section 6](#6-base-de-données-supabase).

---

## 2. Installation

```bash
git clone https://github.com/NewGenesisAgency/verification-cartes.git
cd verification-cartes
npm install --legacy-peer-deps
```

> `--legacy-peer-deps` est nécessaire (React 19). **Une seule fois**, avec internet.

---

## 3. Configuration (`.env.local`)

Crée un fichier **`.env.local`** à la racine du projet :

```bash
# --- Supabase (obligatoire pour l'auth + la base partagée) ---
NEXT_PUBLIC_SUPABASE_URL=https://<votre-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<votre-cle-publishable>

# --- Identifiant de CETTE borne (multi-postes) ---
NEXT_PUBLIC_BORNE_ID=borne-1

# --- Moteur OCR du scan continu ---
# tesseract (recommandé, rapide/offline) | neural (TrOCR, navigateur)
NEXT_PUBLIC_OCR_ENGINE=tesseract

# --- Analyse IA (optionnel, voir section 7) ---
NEXT_PUBLIC_OLLAMA_URL=http://localhost:11434
NEXT_PUBLIC_OLLAMA_MODEL=gemma3:4b
```

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `..._ANON_KEY` | Connexion Supabase (URL + clé publishable). Trouvables dans Dashboard Supabase → Settings → API. |
| `NEXT_PUBLIC_BORNE_ID` | Nom de la borne (ex. `borne-entree`) — tracé dans l'historique. |
| `NEXT_PUBLIC_OCR_ENGINE` | Moteur du scan **continu**. Laisse `tesseract`. L'IA se déclenche séparément (bouton/touche). |
| `NEXT_PUBLIC_OLLAMA_*` | Adresse + modèle du serveur IA local (section 7). |

> ⚠️ `.env.local` n'est **pas** versionné (il contient les clés). Sans Supabase configuré, l'app bascule en **mode local** (fichier Excel + stockage navigateur).

---

## 4. Lancer l'application

### Développement (recommandé pour la borne, fonctionne hors-ligne)
```bash
npm run dev
```
Puis ouvre **http://localhost:3000**.

### Production (optimisé)
```bash
npm run build
npm start
```

> Sous Windows, tu peux aussi double-cliquer sur **`serveur-local.bat`**.

---

## 5. Connexion & comptes

À l'ouverture de `/verification-cartes`, une **connexion** est demandée.

- **Compte administrateur** : `agent@mdl.lycee`
  *(mot de passe défini à l'installation — réinitialisable dans Dashboard Supabase → Authentication → Users)*
- L'admin peut créer d'autres comptes via le bouton **« Comptes »**, avec des **droits cochables** par compte :
  `Scanner`, `Voir stats`, `Exporter`, `Gérer la base élèves`, `Effacer l'historique`, `Gérer les comptes`.

> 🔒 Garde l'inscription publique **désactivée** dans Supabase (données d'élèves mineurs).

---

## 6. Base de données Supabase

Le projet **MDL** est déjà configuré (tables `students`, `passages`, `profiles`,
`audit_log`, politiques RLS, temps réel). Détails dans **[`docs/SUPABASE.md`](docs/SUPABASE.md)**.

**Pour recréer la base de zéro** (nouveau projet Supabase) :
1. Crée un projet sur [supabase.com](https://supabase.com).
2. Dans le **SQL Editor**, exécute le contenu de **[`supabase/schema.sql`](supabase/schema.sql)**.
3. Crée un premier compte admin (Authentication → Users → Add user), puis mets ses
   permissions à `admin` (table `profiles`).
4. Récupère l'URL + la clé publishable (Settings → API) et mets-les dans `.env.local`.

---

## 7. Analyse IA avec Ollama (optionnel)

Permet de lire le nom avec un **modèle de vision local** (gemma3:4b) — utile quand
le QR ou l'OCR classique échouent (carte abîmée, reflets…).

### Installation
```powershell
# Windows (PowerShell)
winget install --id Ollama.Ollama -e --source winget
```
*(ou télécharge l'installeur sur [ollama.com/download](https://ollama.com/download))*

### Télécharger le modèle vision
```bash
ollama pull gemma3:4b
```
> ⚠️ `gemma3:1b` ne gère **pas** les images. Il faut **`gemma3:4b`** (multimodal).

### Autoriser le navigateur à appeler Ollama (CORS)
Définis la variable d'environnement **`OLLAMA_ORIGINS=*`** puis redémarre Ollama.
```powershell
setx OLLAMA_ORIGINS "*"
```

### Utilisation
Une fois Ollama lancé, dans l'app :
- **Touche `Espace`** (ou `A`) → lance l'analyse IA de la carte présentée.
- Bouton **« Analyse IA »** (violet) → idem au clic.
- Bouton **« Auto »** → l'IA se déclenche **toute seule** dès qu'une carte stable est détectée.

Une **barre de chargement** s'affiche pendant l'analyse (~1–2 s sur GPU).
Si Ollama est éteint, l'app continue de fonctionner (repli sur l'OCR classique).

---

## 8. Importer la base élèves (Excel)

Dans le scanner, bouton **« Importer »** (droit *Gérer la base élèves*).
Le fichier `.xlsx` doit contenir ces **colonnes** (la casse/accents sont tolérés) :

| Colonne | Exemple | Obligatoire |
|---|---|---|
| `nom` | TROMPIER-COUTINHO FREIRE | ✅ |
| `prenom` | Téo | ✅ |
| `classe` | TG2 | recommandé |
| `numero` | 18530272 | ✅ (numéro de carte = QR) |
| `eligible` | oui / non | ✅ (sinon tout le monde est `oui`) |

> Le **`numero`** est la clé : si le QR encode ce numéro, la validation est **instantanée**.
> Sans colonne `eligible`, l'app prévient que **tous** les élèves seront marqués éligibles.

---

## 9. Utilisation au quotidien

1. L'élève **présente sa carte** devant la caméra.
2. **QR / code-barres** → validé instantanément (vert = autorisé, rouge = refusé) + son.
3. Si le QR échoue → **OCR du nom** automatique, ou **analyse IA** (Espace / Auto).
4. Carte introuvable / oubliée → bouton **« Rechercher »** : tape le nom/prénom/classe et valide à la main.
5. **« Stats »** → historique, affluence par heure, taux de refus, export **CSV/PDF**, filtres par date/borne.

Anti double-passage : cooldown 1 min (accepté) / 5 min (refusé) par élève.

---

## 10. Plusieurs bornes

Sur chaque poste, mets un `NEXT_PUBLIC_BORNE_ID` différent (`borne-entree`, `borne-cantine`…).
Tous partagent la même base Supabase et l'historique se synchronise **en temps réel**.

---

## 11. Dépannage

| Problème | Solution |
|---|---|
| `localStorage.getItem is not a function` au démarrage | Corrigé automatiquement (`src/instrumentation.ts`). **Redémarre** le serveur après un `git pull`. |
| Caméra noire / inaccessible | Autorise la caméra dans le navigateur ; recharge. Le bouton « Réessayer » relance. |
| Connexion refusée | Vérifie `.env.local` (URL + clé) ; réinitialise le mot de passe via Dashboard Supabase. |
| IA « indisponible » | Ollama n'est pas lancé, ou `OLLAMA_ORIGINS` pas défini. Voir section 7. |
| 1ʳᵉ analyse IA très lente | Chargement du modèle (~30–60 s) ; ensuite ~1–2 s. L'app le précharge au démarrage. |
| `npm run build` échoue sur les polices | Plus le cas (polices retirées du build). Sinon vérifie ta connexion. |
| Debug OCR | Ouvre l'app avec **`?debug=1`** → la console affiche le texte brut lu, et un cadre vert montre la zone détectée. |

---

## 12. Stack technique

- **Next.js 15** (App Router) · **React 19** · **TypeScript** · **Tailwind v4**
- **Supabase** (Postgres + Auth + RLS + Realtime + Edge Functions)
- **tesseract.js** (OCR) · **jsQR** (QR) · **@zxing/library** (PDF417)
- **@huggingface/transformers** (TrOCR, optionnel) · **Ollama / gemma3:4b** (VLM, optionnel)
- **framer-motion** + **GSAP** (animations) · **xlsx** · **jsPDF**

---

*Application réalisée par [NewGenesis](https://newgenesis.ai).*
