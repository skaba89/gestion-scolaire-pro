# Calisthenics Tracker

Application personnelle de suivi d'entraînement callisthénie — 100% côté client, sans backend ni compte : toutes tes données restent dans ton navigateur (IndexedDB).

> ⚠️ Ce dossier est un projet **autonome et indépendant** du reste du dépôt `gestion-scolaire-pro` (aucune dépendance partagée). Il peut être extrait vers son propre dépôt à tout moment en copiant simplement ce dossier.

## Stack

- React 18 + Vite + TypeScript
- Tailwind CSS 4
- React Router (navigation)
- Zustand (état de la séance en cours)
- Dexie.js (IndexedDB — persistance locale des séances)
- `vite-plugin-pwa` (installable sur mobile/desktop, fonctionne hors-ligne)

## Fonctionnalités

- **Programmes d'entraînement** : 3 programmes prêts à l'emploi (débutant full-body, intermédiaire push/pull/legs, avancé skills) avec séries/répétitions/repos par exercice.
- **Bibliothèque d'exercices** : ~20 exercices de callisthénie classés par groupe musculaire et niveau, avec instructions et chemins de progression (facile → difficile).
- **Séance guidée** : lance un jour de programme, valide chaque série avec le nombre de répétitions réalisées, minuteur de repos automatique entre les séries.
- **Minuteur libre** : timer configurable (30s à 3min) pour un circuit, du Tabata, ou du gainage chronométré.
- **Suivi de progression** : historique des séances, série de jours consécutifs (streak), volume d'entraînement sur 14 jours.

## Démarrer en local

```bash
cd calisthenics-tracker
npm install --legacy-peer-deps
npm run dev
```

L'app est servie sur `http://localhost:5173`.

## Build de production

```bash
npm run build
npm run preview
```

Le résultat dans `dist/` est un site statique installable (PWA) — déployable gratuitement sur Netlify, Vercel, GitHub Pages, etc.

## Ajouter tes propres programmes ou exercices

Tout le contenu est défini en TypeScript, facile à éditer :

- `src/data/exercises.ts` — bibliothèque d'exercices
- `src/data/programs.ts` — programmes (jours, séries, répétitions, repos)

Aucune base de données à migrer : ajoute une entrée dans ces fichiers et elle apparaît immédiatement dans l'app.
