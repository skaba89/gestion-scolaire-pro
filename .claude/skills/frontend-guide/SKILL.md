---
name: frontend-guide
description: Conventions frontend React/Vite/TypeScript d'Academy Guinéenne — portails lazy, apiClient, React Query, Zustand, RBAC d'affichage, i18n 5 langues, hors-ligne, Capacitor. À utiliser pour créer ou modifier pages, composants, hooks et requêtes dans src/.
---

# Frontend — conventions d'implémentation

Base : `src/CLAUDE.md`. Ce skill détaille.

## Avant d'écrire

1. Trouver une page/composant voisin du même portail et reprendre sa structure.
2. Vérifier l'endpoint backend réel (chemin, slash final, forme de réponse) dans
   `backend/app/api/v1/` — ne pas supposer un contrat.
3. Chercher un hook existant dans `src/queries/` ou `src/hooks/queries/` avant d'en créer un.

## Données

- `apiClient.get/post/...` depuis `@/api/client`. Chemins relatifs à `/api/v1`
  tels qu'utilisés ailleurs, avec slash final.
- React Query : clés de requête préfixées par le domaine et incluant le tenant
  quand pertinent ; `invalidateQueries` après mutation ; pas de `fetch` dans `useEffect`.
- Persistance du cache React Query activée : ne jamais mettre de donnée sensible
  inutile dans une query persistée.
- Hors-ligne : passer par les hooks `useOffline*` existants ; ne pas créer une
  seconde file de synchronisation.

## Routing & tenant

- Route lazy dans `src/routes/<Portail>Routes.tsx` ; garde de rôle conforme aux routes voisines.
- Liens via `useTenantUrl` / `useTenantNavigate` (jamais d'URL tenant en dur).

## RBAC d'affichage

- `const { can } = usePermissions(); can("grades:write")`.
- Les noms de permission front (`src/lib/permissions.ts`) diffèrent parfois du
  backend (`users:create` vs `users:write`) : vérifier la correspondance et la
  documenter dans le plan. Le backend reste l'autorité.

## i18n

- `const { t } = useTranslation()` ; clés ajoutées dans `fr` (référence) puis
  `en`, `es`, `ar`, `zh`. `npm run check:i18n` doit passer.
- Pas de concaténation de phrases ; utiliser l'interpolation i18next.
- Dates/montants : utilitaires existants (`useCurrency`, date-fns) — pas de format codé en dur.

## Sécurité côté client

- HTML riche : `sanitizeHtml` obligatoire. URLs fournies par un tenant : refuser `javascript:`.
- Ne jamais logguer de token ni de donnée personnelle (`console.*` et Sentry).

## Qualité

- TypeScript strict de fait : typer les réponses API (`src/types`, `src/lib/types`).
- Composants < ~300 lignes : extraire sous-composants/hooks plutôt que grossir.
- Respecter le budget ESLint de la CI (ne pas ajouter de warnings).

## Vérification minimale

```bash
npm run type-check && npm run lint && npm run check:i18n && npx vitest run src/<zone>
```
