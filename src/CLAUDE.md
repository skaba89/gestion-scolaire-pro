# Frontend — React / Vite / TypeScript

Complète le `CLAUDE.md` racine. Détails : skills `frontend-guide`, `ui-ux-guide`,
`rbac-guide`, `testing-guide` dans `.claude/skills/`.

## Carte du code

```
main.tsx, App.tsx            # bootstrap (Sentry, providers, router)
routes/*Routes.tsx           # routes lazy-loaded par portail (Admin, Teacher, Student, Parent, Alumni, Department, Public)
components/TenantRoute.tsx   # résolution du tenant depuis /:tenantSlug/...
components/ProtectedRoute.tsx, RequireTenant.tsx
contexts/                    # AuthContext, TenantContext, ThemeContext
api/client.ts                # apiClient Axios : token, refresh sous mutex, retries 5xx
queries/ , hooks/queries/    # hooks React Query par domaine
stores/                      # Zustand
lib/permissions.ts           # matrice RBAC d'affichage (miroir du backend)
lib/sanitize.ts              # sanitizeHtml (DOMPurify)
i18n/locales/{fr,en,es,ar,zh}.json
pages/<portail>/             # pages par portail
components/ui/               # primitives shadcn — ne pas modifier sans raison
offline/, hooks/useOffline*  # hors-ligne (Dexie, file de synchronisation)
features/                    # modules par domaine (adoption partielle)
```

## Règles

- Appels API **uniquement** via `apiClient` (`@/api/client`) ; jamais `fetch`
  direct ni lecture manuelle du token (clé `schoolflow:access_token`).
- Données serveur via React Query (`src/queries/`) ; Zustand pour l'état UI global.
- **RBAC** : `usePermissions().can("resource:action")` pour masquer l'UI. Ce n'est
  jamais une protection : le backend doit refuser. Nouvelle permission → aussi
  `backend/app/core/security.py` et `docs/PERMISSIONS_MATRIX.md`.
- URLs tenant via `useTenantUrl` / `useTenantNavigate` (préfixe `/:tenantSlug`).
- **i18n** : aucun texte utilisateur en dur ; clés ajoutées dans les 5 locales
  (`npm run check:i18n`). Vérifier le rendu RTL (arabe).
- Terminologie scolaire/universitaire via `useTerminology` / `useStudentLabel`.
- HTML riche : uniquement `dangerouslySetInnerHTML={{ __html: sanitizeHtml(x) }}`.
- Nouvelle page : lazy import dans le fichier `routes/` du portail, états
  chargement / vide / erreur, responsive mobile.
- Ne pas introduire de dépendance npm sans accord (`npm install --legacy-peer-deps`).
- Pas de `console.log` résiduel ; pas de `any` nouveau sans justification.

## Vérifications

```bash
npm run type-check      # tsc strict + cliquet ts-baseline.json (aucune nouvelle erreur)
npm run type-check:update-baseline   # après avoir corrigé des erreurs : baisse la référence
npm run lint            # ne pas dépasser le budget --max-warnings de ci.yml
npm run check:i18n
npx vitest run src/<chemin>
npm run build
```

Tests : Vitest + Testing Library (`src/**/__tests__/`), Playwright dans `tests/e2e/`.
