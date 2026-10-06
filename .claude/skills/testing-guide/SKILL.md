---
name: testing-guide
description: Stratégie de tests Academy Guinéenne — pytest (SQLite et PostgreSQL/RLS), fixtures conftest, gabarits de tests d'autorisation/IDOR/cross-tenant, Vitest + Testing Library, Playwright, exigences CI. À utiliser pour écrire des tests, choisir quoi tester, ou valider l'étape TESTS / REGRESSION CHECK.
---

# Tests

Exigences CI exactes (commandes, seuils de couverture, budget ESLint) :
`.github/workflows/ci.yml` — la seule référence ; ne pas recopier les chiffres ailleurs.

## Backend (pytest)

- `backend/tests/conftest.py` : base SQLite de test, fixtures `client`,
  `auth_headers`, `super_admin_headers`, `student_headers`, `mock_current_user`…
  Lire le conftest avant d'écrire un test.
- **SQLite n'a pas de RLS** : un test d'isolation tenant doit aussi être valable
  sur PostgreSQL (job CI `backend-tests`). Ne jamais conclure « isolation OK »
  sur la seule base SQLite.
- Nommer `test_<domaine>_<comportement>.py`, comme l'existant.

### Matrice minimale pour un endpoint nouveau/modifié

| Cas | Attendu |
|---|---|
| Rôle autorisé, son tenant | 2xx + contenu correct |
| Sans token | 401 |
| Rôle non autorisé | 403 |
| Ressource d'un autre tenant | 404 (ou 403), jamais 200 |
| FK d'un autre tenant dans le corps | 4xx, aucune écriture |
| Rôle personnel sur la ressource d'autrui | 403/404 |
| Entrée invalide / limite de pagination dépassée | 422 |
| Idempotence (si applicable) | même réponse, pas de doublon |

Correctif de bug : écrire d'abord le test qui échoue, puis corriger.

```bash
cd backend
python -m pytest tests/test_<x>.py -q -x
python -m pytest tests/ -q                 # suite complète avant SHIP
```

## Frontend (Vitest)

- Tests dans `src/**/__tests__/*.test.ts(x)`, setup `vitest.setup.ts`, jsdom.
- Tester le comportement visible (Testing Library), mocker `apiClient`, pas les détails d'implémentation.
- Hooks React Query : wrapper `QueryClientProvider` comme dans les tests existants.

```bash
npx vitest run src/<zone>
npx vitest run            # suite complète
```

## E2E (Playwright)

- `tests/e2e/*.spec.ts`, smoke : `npm run test:e2e:smoke` (config `playwright.smoke.config.ts`).
- Ajouter/adapter un E2E pour tout parcours critique modifié (auth, présence, paiement, RBAC).

## REGRESSION CHECK

1. Suites complètes backend + frontend vertes (citer les totaux réels).
2. `npm run type-check`, `npm run lint` (budget non dépassé), `npm run check:i18n`, `npm run build`.
3. `alembic heads` = 1 si migrations touchées.
4. Recherche des appelants des fonctions modifiées (`grep`) : contrat inchangé ou adapté partout.
5. Alias et routes jumelles vérifiés.
6. Rapporter honnêtement : tests non lancés ou en échec = le dire, avec la sortie.
