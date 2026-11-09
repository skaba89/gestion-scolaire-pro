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
| 3 | `scripts/ci/seed_e2e.py` | établissements « Université La Source (démo) » et « témoin » ; comptes admin, enseignant, direction, secrétariat, comptabilité, chef de département, étudiant (fiche reliée), parent (relié à l'étudiant), ancien étudiant (fiche diplômée) |
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
| `09-role-portals.spec.ts` | recette des portails : pour 9 rôles, chaque entrée du menu latéral est ouverte (page 404, erreur d'affichage, renvoi hors portail, API 5xx/404) ; un autre portail renvoie vers le sien ; une API hors permission répond 403 |
| `10-offline-privacy.spec.ts` | après déconnexion par l'interface, aucune base IndexedDB hors ligne ne conserve de données (élèves en cache compris) |
| `11-offline-attendance-sync.spec.ts` | réseau coupé (`context.setOffline`) : pointage hors ligne, correction, retour du réseau → une seule présence côté API, au dernier statut |
| `14-parent-cannot-self-pay.spec.ts` | un parent ne peut pas déclarer lui-même un paiement en espèces ou par virement (403) ; la facture reste impayée |
| `15-payment-reversal-export.spec.ts` | encaissements Mobile Money + espèces → annulation du Mobile Money : facture revenue à PARTIAL, seconde annulation refusée (400), reçu « Paiement annulé », solde ré-encaissable ; export CSV avec la ligne REVERSED et filtre par statut ; le parent ne peut ni annuler (403) ni exporter les paiements d'une autre famille (403) |

Le paiement **en ligne** par passerelle (CinetPay / PayTech) n'est pas joué :
l'initier appelle l'API réelle du prestataire. Son rapprochement par webhook
signé est couvert par `backend/tests/test_payment_webhook_events.py`.

Le PDF du bulletin exige WeasyPrint et ses bibliothèques système (installées
par le job CI, comme dans `backend/Dockerfile`). Sans elles, l'étape PDF du
parcours 03 échoue en local — c'est attendu.

## Recette des portails (parcours 09)

- **Connexions espacées** : `global-setup.ts` ouvre 10 sessions alors que
  `/auth/login/` accepte 5 essais par minute et par IP ; il n'en fait pas plus
  de 4 par minute glissante (≈ 2 min de pauses). La limite n'est pas relevée.
- **Débit API** : l'API limite chaque IP à 100 requêtes/min ; le parcours
  attend que moins de 70 appels aient eu lieu sur la dernière minute avant
  chaque page, et navigue dans l'application (`pushState`) sans recharger.
- **Référence-cliquet** `role-portals.baseline.json` : défauts connus par
  rôle. Un défaut absent de la liste fait échouer le test ; une entrée qui
  ne se reproduit plus aussi (la retirer avec le correctif). Les défauts d'API
  sont rattachés à la route API (une relance React Query peut aboutir sur la
  page suivante), ceux d'affichage à la page. Rapport complet joint au test.
- Durée mesurée : ≈ 12 min pour les 9 rôles.

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
