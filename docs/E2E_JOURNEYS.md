# Parcours E2E sur une vraie stack

Tests Playwright de bout en bout exécutés contre une stack réelle :
PostgreSQL 16 avec RLS (l'API tourne sous un rôle **NOBYPASSRLS**, comme
`schoolflow_api` en production), Redis, API FastAPI, worker ARQ et frontend
Vite. Ils complètent le smoke navigateur (`tests/e2e/smoke`, sans backend).

- Configuration : `playwright.journeys.config.ts`
- Tests : `tests/e2e/journeys/`
- CI : job `e2e-journeys` de `.github/workflows/ci.yml` — **pas encore un
  contrôle obligatoire** de `main` ; il le deviendra une fois sa stabilité
  mesurée (décision humaine : configuration GitHub).

## Données

| Étape | Outil | Contenu |
|---|---|---|
| 1 | `alembic upgrade head` (rôle propriétaire) | schéma + politiques RLS |
| 2 | `scripts/ci/e2e_app_role.sql` | rôle `e2e_app` NOSUPERUSER NOBYPASSRLS |
| 3 | `scripts/ci/seed_e2e.py` | établissements « Université La Source (démo) » et « témoin », comptes admin / enseignant |
| 4 | `scripts/seed_universite_la_source.py` (via l'API) | facultés, programmes, niveaux, classes, matières, périodes de notation |

`seed_e2e.py` écrit directement en base car `POST /tenants/create-with-admin/`
exige l'envoi réel d'un e-mail d'invitation. Il refuse de tourner sans
`E2E_ALLOW_SEED=1`. Les mots de passe sont générés à chaque exécution et
écrits dans `E2E_CREDENTIALS_FILE` (JSON) — jamais affichés.

## Parcours couverts

| Fichier | Parcours |
|---|---|
| `01-student-enrollment.spec.ts` | l'admin crée un étudiant par le formulaire, l'affecte à « L1 Économie » |
| `02-isolation-and-roles.spec.ts` | un autre établissement ne lit ni ne modifie rien ; l'enseignant n'accède pas aux finances (API 403, interface redirigée) |
| `03-grades-report-card.spec.ts` | l'enseignant affecté à « L1 Économie »/ECO101 crée une évaluation et saisit une note ; l'admin la voit dans les bulletins et télécharge un vrai PDF (WeasyPrint) |
| `04-fees-invoice-mobile-money.spec.ts` | frais d'inscription → facture → paiement **Mobile Money reçu** (référence Orange Money) → solde en espèces → facture « Payé » ; méthode `MOBILE_MONEY` vérifiée par l'API |
| `05-teacher-attendance.spec.ts` | l'enseignant pointe un absent puis corrige en présent (boutons accessibles « Absent » / « Présent ») ; l'API ne garde qu'une présence, au statut corrigé |

Le paiement **en ligne** par passerelle (CinetPay / PayTech) n'est pas joué :
l'initier appelle l'API réelle du prestataire. Son rapprochement par webhook
signé est couvert par `backend/tests/test_payment_webhook_events.py`.

Le PDF du bulletin exige WeasyPrint et ses bibliothèques système (installées
par le job CI, comme dans `backend/Dockerfile`). Sans elles, l'étape PDF du
parcours 03 échoue en local — c'est attendu.

## Lancer en local

```bash
# 1. PostgreSQL + Redis jetables
docker run -d --name e2e-pg -e POSTGRES_USER=schoolflow -e POSTGRES_PASSWORD=testpassword \
  -e POSTGRES_DB=schoolflow_e2e -p 55440:5432 postgres:16-alpine
docker run -d --name e2e-redis -p 56390:6379 redis:7-alpine

OWNER=postgresql://schoolflow:testpassword@localhost:55440/schoolflow_e2e
APP=postgresql://e2e_app:e2e-app-pw@localhost:55440/schoolflow_e2e
export E2E_CREDENTIALS_FILE=/tmp/e2e-credentials.json
export DEBUG=true SECRET_KEY=e2e-local-secret-key-0123456789abcdefgh \
  BOOTSTRAP_SECRET=e2e-local-bootstrap-secret-0123456789ab \
  REDIS_URL=redis://localhost:56390/0 BACKEND_CORS_ORIGINS=http://localhost:3000

# 2. Schéma, rôle restreint, comptes
(cd backend && DATABASE_URL=$OWNER DATABASE_URL_SYNC=$OWNER DATABASE_URL_ASYNC=$OWNER alembic upgrade head)
docker exec -i e2e-pg psql -U schoolflow -d schoolflow_e2e < scripts/ci/e2e_app_role.sql
E2E_ALLOW_SEED=1 DATABASE_URL=$OWNER DATABASE_URL_SYNC=$OWNER DATABASE_URL_ASYNC=$OWNER \
  python scripts/ci/seed_e2e.py

# 3. API + worker sous le rôle restreint (deux terminaux)
cd backend && DATABASE_URL=$APP DATABASE_URL_SYNC=$APP DATABASE_URL_ASYNC=$APP \
  uvicorn app.main:app --port 8000
cd backend && DATABASE_URL=$APP DATABASE_URL_SYNC=$APP DATABASE_URL_ASYNC=$APP \
  arq app.workers.tasks.WorkerSettings

# 4. Structure Université La Source, puis les parcours (le frontend est lancé par Playwright)
ULS_API_URL=http://127.0.0.1:8000/api/v1 \
ULS_ADMIN_EMAIL="$(python -c "import json;print(json.load(open('$E2E_CREDENTIALS_FILE'))['uls']['admin']['email'])")" \
ULS_ADMIN_PASSWORD="$(python -c "import json;print(json.load(open('$E2E_CREDENTIALS_FILE'))['uls']['admin']['password'])")" \
  python scripts/seed_universite_la_source.py
npx playwright test -c playwright.journeys.config.ts
```

Les parcours sont rejouables sur la même base (matricules uniques par
exécution). La connexion se fait une fois par rôle (`global-setup.ts`) :
la route de connexion est limitée à 5 essais par minute et chaque compte à
5 sessions actives.

## Règle

Un parcours qui échoue sur un vrai bug ne se contourne pas dans le test :
le bug est corrigé (avec son test) dans le code de l'application.
