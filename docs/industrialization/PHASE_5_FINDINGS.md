# Phase 5 — Stabilisation auth tenant-aware et synchronisation du store

## Contexte
Après les phases 2 à 4, les points les plus sensibles restants concernent :
- la page `/auth` encore partiellement hybride ;
- la préservation du chemin demandé avant le SSO ;
- la cohérence entre `AuthContext` et `AuthSyncProvider` ;
- la synchronisation du store global lorsque les rôles changent sans changer de cardinalité.

## Constats techniques

### 1. `src/pages/Auth.tsx`
Le fichier contient encore des imports et traces héritées d’anciens flux (notamment Supabase), des logs non bornés et une logique de redirection tenant-aware qui mérite d’être consolidée.

### 2. `src/components/providers/AuthSyncProvider.tsx`
Le provider dépendait notamment de `auth.roles.length` au lieu d’une représentation stable du contenu réel des rôles. Cela peut rater une resynchronisation si les rôles changent mais gardent la même taille.

### 3. Contrat avec le store Zustand
`syncAuth` attend des objets compatibles avec `src/stores/types.ts`, notamment :
- `User` avec `first_name`, `last_name`, `avatar_url`, `is_active` ;
- `Tenant` avec `logo_url`, `is_active`, `settings` ;
- `Permission` avec `tenant_id`, `user_id`, `role`.

## Lot phase 5 préparé
Le lot technique préparé mais pas encore attaché proprement à une ref distante inclut :

### A. `src/pages/Auth.tsx`
- suppression des imports hérités inutiles ;
- calcul du chemin demandé à préserver avant SSO ;
- meilleure inférence du `tenantSlug` à partir de l’URL demandée ;
- redirection plus robuste après authentification ;
- logs de debug bornés par environnement.

### B. `src/components/providers/AuthSyncProvider.tsx`
- utilisation d’un `rolesJson` stable ;
- prise en compte de `profileId` dans la détection de changement ;
- mapping correct vers les types du store Zustand ;
- permissions générées avec `tenant_id`, `user_id`, `role` cohérents.

### C. Tests ciblés
- préservation du chemin demandé avant `signInWithKeycloak()` ;
- redirection d’un utilisateur authentifié vers le chemin attendu ;
- vérification que `AuthSyncProvider` pousse bien les bons champs dans `syncAuth`.

## Recommandation
Créer un lot Git propre à partir de `main` avec ces trois modifications :
1. `src/pages/Auth.tsx`
2. `src/components/providers/AuthSyncProvider.tsx`
3. `src/components/__tests__/auth-flow-sync.test.tsx`

Puis ouvrir une PR dédiée :
`Phase 5 : stabilisation de /auth et de la synchronisation auth/store`

## Décision Tech Lead
Le besoin est légitime et prioritaire avant toute ambition de mise en production. Ce lot doit être intégré avant d’avancer sur le durcissement final des parcours métier.
