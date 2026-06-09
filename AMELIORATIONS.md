# Améliorations CamViewer / MDL

## 🎯 Objectif du scanner
Vérifier l'identité d'un élève et son éligibilité **soit par QR code (numéro Passe
Région), soit par reconnaissance du nom/prénom (OCR)** — les deux chemins doivent
fonctionner pour faire passer les élèves plus vite.

---

## ✅ Refactor effectué (perf + fiabilité)

### 1. Worker OCR singleton — `utils/ocrWorker.ts`
**Avant :** un worker Tesseract (téléchargement + init du modèle FR) était créé
**puis détruit à chaque frame** (toutes les 500 ms). C'était LE goulot
d'étranglement.
**Après :** un seul worker initialisé une fois, réutilisé, appels sérialisés via
une file. Pré-chargé au montage (`preloadOCR`) → premier scan instantané, libéré
au démontage (`terminateOCR`).

### 2. Boucles QR et OCR découplées — `verification-cartes/page.tsx`
**Avant :** QR et OCR dans la même fonction gardée par `isProcessingRef` → le QR
était **bloqué pendant toute la durée de l'OCR** (lent).
**Après :**
- **Boucle QR** rapide (200 ms), jamais bloquée → passage quasi instantané au QR.
- **Boucle OCR** (700 ms), sérialisée, pour la reconnaissance par nom.

### 3. Région d'intérêt (ROI) + amélioration image — `utils/imageProcessing.ts`
L'OCR ne traite plus toute l'image mais une **zone centrée** (là où l'élève
présente sa carte) : upscaling ×2, **niveaux de gris**, contraste. Plus rapide et
plus précis. Code d'amélioration d'image centralisé (était dupliqué 2×).

### 4. Matching tolérant aux erreurs OCR — `utils/detectionHelper.ts`
**Avant :** appariement **strictement exact** → la moindre faute OCR (« MARTÌN »
vs « MARTIN ») cassait la reconnaissance par nom.
**Après :** correction des **confusions OCR** fréquentes (0↔O, 1↔I, 5↔S, 8↔B, 3↔E)
+ **distance de Levenshtein** avec tolérance proportionnelle à la longueur du mot
+ **score de confiance** affiché à l'écran. Les mots ≤ 3 lettres restent en
correspondance exacte (anti-faux-positifs).

### 5. Nettoyage
- **Logs coupés** en production via `utils/debug.ts` (`?debug=1` pour les réactiver).
- **6 fichiers de code mort supprimés** : `intelligentMatcher`, `advancedMatcher`,
  `nlpNameDetector`, `frenchNames`, `tensorflowOCR`, `api` (3 implémentations
  parallèles abandonnées du même matcher, jamais importées).
- Logique dédupliquée (`showResult`, `registerScan`, `parseStudents`,
  `extractValidNames`).
- Carte d'erreur visible aussi pour un QR inconnu (avant : silencieux) + son.
- Flag `next.config` expérimental invalide retiré.

> Vérifié : `tsc --noEmit` ✅ et `next lint` ✅ passent. (Le `next build` complet
> échoue uniquement sur le fetch réseau des polices Google — limite de l'env hors
> ligne, sans rapport avec le code.)

---

## 🚀 Roadmap — features à fort impact

### Fiabilité du scan
- [x] **Détection de présence + stabilité** : l'OCR ne se lance que si la ROI
      contient assez de détail (variance ≥ `MIN_DETAIL_VARIANCE`) ET que l'image
      est stable (`frameDiff` ≤ `STABILITY_THRESHOLD`). Évite le gaspillage CPU et
      le flou de mouvement. → `utils/imageProcessing.ts` (`sampleROI`, `frameDiff`).
- [x] **Confirmation multi-frames** : une correspondance OCR approximative doit
      être vue 2 lectures de suite avant validation ; une quasi exacte
      (confiance ≥ `HIGH_CONFIDENCE`) passe direct. Le QR reste instantané.
- [x] **Lecture PDF417** (dos des cartes Passe Région) via ZXing, en repli du QR
      (throttlé 1 frame/3). → `utils/pdf417.ts`, intégré à `scanQR`.
- [x] **Moteur OCR pluggable** (`utils/ocrEngine.ts`) : `tesseract` (défaut) ou
      `neural` = **TrOCR** (transformer, Transformers.js) via `NEXT_PUBLIC_OCR_ENGINE`.
      Repli auto Tesseract si le modèle ne charge pas. Modèle téléchargé au 1er
      usage (cache navigateur) ; configurable via `NEXT_PUBLIC_TROCR_MODEL`.
- [x] **Pipeline CV avancé avant OCR** (`utils/textPipeline.ts`) : niveaux de gris →
      **deskew** (redressement par projection cisaillée) → **binarisation adaptative
      Sauvola** (images intégrales) → **détection des lignes de texte** (projection +
      extension) → **recadrage sur le bloc de nom**. Profite à Tesseract ET TrOCR.
      + Tesseract en **PSM bloc uniforme**. Repli auto sur image simple si échec.
- [x] **Overlay caméra des zones détectées** : les lignes de texte repérées par le
      pipeline sont dessinées en temps réel (rectangles émeraude qui s'estompent)
      sur le flux — feedback « pro » + aide au réglage des seuils.
- [ ] Filtrage par confiance OCR mot-à-mot + détection neuronale de zone (DBNet)
      — à valider/tuner sur caméra réelle.

### Anti-fraude / identité
- [—] Reconnaissance faciale : **retirée** (décision : biométrie de mineurs trop
      sensible RGPD pour le bénéfice face au QR). `faceCheck.ts`, modèles et la
      dépendance `@vladmandic/face-api` ont été supprimés.
- [x] **Garde-fou `eligible`** : à l'import, si aucune colonne d'éligibilité n'est
      détectée, l'admin est averti que tous les élèves seront marqués éligibles.
- [ ] Détection de réutilisation de carte (au-delà du cooldown).

### Données & multi-postes
- [x] **Migration Supabase** : projet `MDL` (ref `VOTRE-REF-PROJET`, Paris).
      Tables `students` + `passages`, RLS réservé aux agents authentifiés.
      Élèves = source de vérité partagée ; passages écrits en base avec
      **file d'attente offline** rejouée à la reconnexion. Repli xlsx/localStorage
      si Supabase indisponible. → voir `docs/SUPABASE.md`.
- [x] **Authentification agent MDL** : login email/mot de passe (`AuthGate`),
      session persistée, pages `/verification-cartes/*` protégées.
- [x] **Gestion des comptes + permissions granulaires** : table `profiles.permissions`
      (jsonb), helper RLS `has_perm()`, Edge Function `manage-users` (service_role,
      vérifie `manage_accounts`) pour créer/modifier/supprimer des comptes et
      réinitialiser les mots de passe. Page admin `/verification-cartes/comptes`
      (animée framer-motion). 6 droits : scan, view_stats, export, manage_students,
      clear_history, manage_accounts. Gating UI par `can()` partout.
- [x] **Dashboard analytics** (page Historique) : affluence par heure, taux de
      refus (acceptés/refusés), top classes — en barres CSS, zéro dépendance.
- [x] **Temps réel (Supabase Realtime)** : les passages de toutes les bornes
      s'affichent en direct (badge « Temps réel »). Chaque borne est identifiée
      via `NEXT_PUBLIC_BORNE_ID` (colonne `passages.borne`).
- [x] **Filtres dashboard** : par date et par borne (sur cartes, analytics,
      tableau et export CSV). Colonne « Borne » ajoutée au tableau et au CSV.
- [x] **Rôles admin / agent** : table `profiles` + helper `is_admin()` + RLS par
      rôle (écriture élèves & suppression historique réservées aux admins ;
      lecture/scan pour tous les agents). UI : import & « Effacer » masqués aux
      agents, badge + déconnexion. `hooks/useProfile.tsx`. Compte existant = admin.
- [x] **Export PDF** des rapports (jsPDF + autotable) : KPIs, top classes, tableau,
      respecte les filtres date/borne. → `utils/exportPdf.ts`, bouton « PDF ».
- [x] **Journal d'audit admin** : table `audit_log` (RLS admin) ; import base &
      effacement historique tracés (acteur, action, détails). Vue « Journal admin »
      sur la page Historique. → `utils/auditRepo.ts`.

### Produit
- [x] **Recherche manuelle** dans la base (modale sur le scanner, droit `scan`) :
      filtre par nom/prénom/classe (multi-mots, sans accents) ; un clic valide
      l'accès de l'élève (passage enregistré avec `source: 'manual'`).
- [x] **Animations UI** (framer-motion) : verdict scanner avec flash plein écran
      vert/rouge + carte résultat en ressort (pop d'icône, texte décalé), reveal
      accéléré, page Comptes animée (apparition en cascade).
- [x] **PWA mode kiosque** : manifeste (`app/manifest.ts`, display fullscreen,
      icône dédiée), bouton plein écran sur le scanner, service worker
      réseau-d'abord (`public/sw.js`, prod uniquement) pour le repli hors-ligne.
- [ ] Nouvelles apps MDL : billetterie événements, boutique, sondages/votes.

### Qualité
- [ ] Tests (Vitest + Playwright sur flux caméra mocké) + CI.
- [ ] Validation Zod du schéma Excel importé.
- [ ] RGPD : minimisation, rétention configurable, anonymisation des stats
      (données d'élèves mineurs = sensible).
