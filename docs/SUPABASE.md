# Backend Supabase — projet MDL

## Coordonnées
- **Projet :** `MDL` · organisation `NewGenesis`
- **Ref / ID :** `VOTRE-REF-PROJET`
- **URL API :** `https://VOTRE-REF-PROJET.supabase.co`
- **Région :** Paris (eu-west-3)
- **Coût :** 0 €/mois (plan gratuit — ⚠️ le projet se met en pause après ~1
  semaine sans activité ; il se réveille au premier accès).

## Configuration
Les clés sont dans `.env.local` (gitignoré) :
```
NEXT_PUBLIC_SUPABASE_URL=https://<votre-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<votre-cle-publishable>
```
> Les vraies valeurs sont dans `.env.local` (non versionné).
Si ces variables sont absentes, l'app retombe automatiquement en **mode local**
(xlsx + localStorage) : la borne fonctionne sans backend.

## Compte (à changer !)
- **Email :** `agent@mdl.lycee`
- **Mot de passe :** *(défini lors du setup — voir gestionnaire de secrets, à changer au 1er login)*
- **Rôle :** `admin` (gère la base élèves + efface l'historique).

### Rôles
- Table `profiles` (`id`, `email`, `role` ∈ {admin, agent}), créée auto à
  l'inscription (trigger `handle_new_user`). Helper `is_admin()`.
- **admin** : import/écriture élèves, suppression de l'historique. **agent** :
  scanner + consulter. RLS appliquée en base + UI masquée côté client
  (`hooks/useProfile.tsx`).
- Pour créer un agent : Dashboard → Authentication → Users (son profil sera
  `agent` par défaut). Garder l'inscription publique **désactivée**.

> ⚠️ Change ce mot de passe (Dashboard Supabase → Authentication → Users) et crée
> un compte par agent si besoin. **L'inscription publique doit rester désactivée**
> (sinon n'importe qui pourrait se créer un accès aux données élèves).

## Schéma
- **`students`** : `id`, `nom`, `prenom`, `classe`, `numero` (QR Passe Région),
  `eligible` (**booléen**), `created_at`, `updated_at`.
- **`passages`** : `id`, `student_id`, `nom`, `prenom`, `classe`, `eligible`,
  `statut` ('Accepté'/'Refusé'), `source` ('qr'/'ocr'), `borne`, `scanned_at`.
- **RLS** activé : lecture/écriture réservées au rôle `authenticated`.

## Flux applicatif
- **Login** : `components/AuthGate.tsx` protège `/verification-cartes/*`.
- **Élèves** : `utils/studentsRepo.ts` — `fetchStudents` (source de vérité),
  `replaceAllStudents` (appelé à l'import Excel → remplace la base partagée).
- **Passages** : `utils/passagesRepo.ts` — `recordPassage` (insert + file offline
  `mdl_passage_queue`), `flushPassageQueue` (rejoue au montage), `fetchPassages`,
  `deleteAllPassages`.
- **Client** : `utils/supabase.ts` (session persistée, auto-refresh).

## À faire côté dashboard (sécurité)
- **Activer « Leaked password protection »** (Auth → Policies) : refuse les mots
  de passe compromis (HaveIBeenPwned).
- Changer le mot de passe du compte admin et garder l'inscription publique OFF.

## Fonctionnalités scan additionnelles
- **PDF417** : lecture du code-barres au dos des cartes Passe Région en repli du
  QR (`utils/pdf417.ts`, ZXing).
- **Vérification faciale** (OFF par défaut, `NEXT_PUBLIC_FACE_CHECK`,
  `utils/faceCheck.ts`) : présence d'un visage exigée à la validation ; modèles à
  déposer dans `public/models/` ; aucune donnée biométrique stockée. RGPD : base
  légale requise avant activation.

## Mise en route
1. `npm install --legacy-peer-deps` (le SDK `@supabase/supabase-js` est déjà ajouté).
2. `npm run dev`
3. Ouvrir `/verification-cartes` → se connecter avec le compte agent.
4. **Importer** le fichier Excel des élèves (bouton « Importer ») → la base est
   poussée dans Supabase et devient la source partagée entre toutes les bornes.

## Temps réel & multi-bornes (en place)
- La table `passages` est dans la publication `supabase_realtime` : la page
  Historique s'abonne aux insertions (`components`/page `passage`) et se recharge
  en direct quand n'importe quelle borne enregistre un passage (badge « Temps réel »).
- Chaque borne s'identifie via `NEXT_PUBLIC_BORNE_ID` (ex. `borne-entree`),
  stocké dans `passages.borne`.
- Dashboard analytics sur la page Historique : affluence par heure, taux de
  refus, top classes.
- **Filtres** par date et par borne (cartes, analytics, tableau, export CSV) ;
  colonne « Borne » dans le tableau et le CSV.

## Prochaines étapes possibles
- Export PDF des rapports d'affluence.
- Rôles fins (admin vs agent) via une table `profiles` + politiques RLS par rôle.
