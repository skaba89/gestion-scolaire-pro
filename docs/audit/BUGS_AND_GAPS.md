# Défauts et manques vérifiés — 2026-11-02 (commit `c28b482`), statuts au 2026-11-03 (`6540145`)

Chaque entrée : constat, preuve, impact, correctif attendu, test de régression.
**[V]** vérifié · **[R]** reproductible · **[P]** potentiel.

## A. Sessions et authentification (P0)

### BUG-SESS-01 — Révocation de session simulée [V] — **CORRIGÉ** (#342)
- `src/hooks/useLoginTracking.ts` : `getActiveSessions()` → `[]` en dur ;
  `terminateSession()` → `true` sans requête.
- `src/pages/admin/SecuritySessions.tsx:53-71` affiche « Session terminée » /
  « N session(s) déconnectée(s) » sans qu'aucune session ne soit révoquée.
- Impact : un administrateur croit avoir coupé l'accès d'un appareil perdu ou
  compromis alors que le jeton reste valide (jusqu'à 7 jours via refresh).
- Correctif : registre serveur des sessions, révocation réelle, UI branchée.
- Test : révoquer une session → toute requête et tout `/auth/refresh/` avec ce
  jeton → 401 ; les autres sessions restent valides.

### BUG-SESS-02 — Aucun audit serveur des authentifications [V] — **CORRIGÉ** (#342)
- Aucun appel `log_audit` dans `backend/app/api/v1/endpoints/core/auth.py` ni
  `mfa.py` (connexion réussie/échouée, MFA, logout, logout-all, changement et
  réinitialisation de mot de passe).
- `trackLogin()` (front) n'est appelé nulle part ; même s'il l'était, l'entrée
  serait stockée `CLIENT_LOGIN` (préfixe imposé par #339) et donc falsifiable
  par conception.
- `getLoginHistory()` filtre `action=LOGIN` (jamais écrit) et lit `data.items`
  alors que `GET /audit/` renvoie un tableau → historique toujours vide.
- Correctif : événements écrits par le serveur (`LOGIN_SUCCESS`,
  `LOGIN_FAILED`, `MFA_FAILED`, `LOGOUT`, `LOGOUT_ALL`, `SESSION_REVOKED`,
  `PASSWORD_CHANGED`) avec IP et user-agent ; lecture front corrigée.

### BUG-SESS-03 — Registre Redis des sessions incohérent [V code ; P impact] — **CORRIGÉ** (#342)
- `register_active_session()` (`auth.py:77-105`) et `/auth/refresh/`
  (`auth.py:603-620`) : ensemble `sfp:active_sessions:{user}` avec TTL
  `ACCESS_TOKEN_EXPIRE_MINUTES` (30 min), remis à zéro à chaque ajout.
- Chaque refresh **ajoute** un nouveau jti sans retirer l'ancien.
- Conséquences : (1) le plafond de 5 sessions concurrentes n'est appliqué que
  dans une fenêtre de 30 min alors qu'une session dure jusqu'à 7 jours ;
  (2) avec plusieurs onglets/appareils actifs, les refresh successifs
  remplissent l'ensemble et un refresh légitime peut recevoir **429 « Too many
  active sessions »**, ce qui déconnecte l'utilisateur côté front.
- Correctif : identifiant de session stable (`sid`) conservé au refresh,
  registre indexé par `sid`, durée de vie = `SESSION_MAX_AGE_DAYS`, sessions
  inactives (> `SESSION_IDLE_TIMEOUT_HOURS`) non comptées.

### BUG-SESS-04 — `except Exception: pass` dans l'émission de jeton [V] — **CORRIGÉ** (#342)
- `_issue_full_session_token()` (`auth.py:160-167`) ignore silencieusement une
  panne Redis lors de la lecture de `token_version` (règle d'or n° 6).

## B. Fonctions simulées présentées comme réelles

### SIM-AI-01 — Tendances IA fabriquées [V] — **CORRIGÉ** (#343)
- `src/hooks/useAIInsights.ts:178-190` : courbes « moyenne / présence / risques »
  des 6 derniers mois calculées avec `Math.random()` autour de la valeur
  courante ; `src/components/admin/ai/AICharts.tsx:30-31` : axes
  « Engagement » et « Progression » aléatoires ; recommandations avec impacts
  chiffrés en dur (« Augmentation de 25 % de l'engagement »).
- Impact : un directeur peut prendre une décision sur des données inventées.
- Correctif : séries historiques réelles (agrégats par mois côté API) ou retrait
  des graphiques ; retrait des pourcentages d'impact non mesurés.

## C. Facturation SaaS (P1)

### BILL-01 — Quotas mesurés mais non appliqués [V] — **OUVERT** (décision produit)
- `saas_quota_service.py` calcule utilisateurs, requêtes IA et exports/jour,
  sans blocage (`hard_enforce=False`) ; `middlewares/quota.py` ne bloque que
  élèves/enseignants/personnel.
- Impact : coûts IA non plafonnés par établissement ; offre « ≤ 50
  utilisateurs » non tenue.
- Décision produit requise : quels comptes comptent dans `max_users`
  (administratifs seulement, ou aussi enseignants/parents/élèves) ; seuils et
  préavis pour les établissements déjà au-delà.

## D. Exploitation (P0/P1)

### OPS-01 — Restauration de la production non prouvée de bout en bout [V] — **OUVERT** (description corrigée le 2026-11-02, #344)
- **Correction de la première version de ce document**, qui affirmait à tort
  qu'aucun script de restauration n'était versionné. Existent bien :
  `scripts/restore-database.sh` ; un exercice en CI (`ci.yml`, job PostgreSQL :
  `backup-database.sh` → `restore-database.sh --target-db
  schoolflow_restore_drill`) ; la procédure manuelle « Restaurer depuis
  Backblaze B2 » de `deploy/vps/README.md`.
- Manques réels : l'exercice CI restaure un dump `pg_dump -Fc` produit par
  le script du dépôt, **pas** le format de production (`.sql.gz` du service
  `db-backup`, chiffré par rclone sur B2) ; il ne vérifie que
  `SELECT count(*) FROM alembic_version` (ni volumes par table, ni RLS, ni
  rôle runtime) ; aucun exercice de restauration depuis B2 n'est journalisé
  avec sa date et sa durée (RTO réel inconnu).
- Correctif : exercice périodique depuis B2 sur base isolée, contrôles
  (comptages, RLS `FORCE`, head Alembic, connexion sous `schoolflow_app`),
  durée mesurée et consignée.

### OPS-02 — Mono-VPS [V] — **OUVERT**
- Aucune redondance ; RPO ≈ 24 h (dump quotidien), RTO non mesuré.

## E. Qualité

### QA-01 — Suite pytest non hermétique [R]
- Reproduction : lancer `python -m pytest tests/ -q` avec un
  `backend/test.db` préexistant → 21 échecs (`UNIQUE constraint failed:
  students.registration_number`, `tenants.slug`) ; base supprimée → 0 échec.
- Correctif : fixture de session qui recrée la base, ou identifiants uniques.
- 2026-11-03 : 19 échecs à la 2e exécution sur `main` ; en PostgreSQL aussi,
  `test_payment_business_rules.py` (références fixes `REC-TEST-1`…) échoue
  en 409 à la 2e exécution sur la même base.

### QA-02 — Dette TS/ESLint [V] — **OUVERT** (184 / 2 027 au 2026-11-03)
- 184 erreurs `tsc` strictes, 2 048 avertissements ESLint (détail dans
  `AUDIT_GLOBAL.md` § 1).

## G. Appels frontend vers des routes inexistantes [V statique, à confirmer] — **OUVERT** (API-01)

Recensement du 2026-11-03 : **94 appels** (77 chemins, 17 méthodes) — liste
complète et reproductible dans `API_ROUTE_GAPS.md`, effet par écran dans
`FEATURE_MATRIX.md`.

Méthode : OpenAPI de l'application comparée aux appels littéraux
`apiClient.<verbe>("…")` de `src/` (hors tests). 91 appels sur 997 sans route.
Groupes principaux :

| Zone | Exemples | Effet probable |
|---|---|---|
| Badges / gamification | `src/lib/badge-api.ts`, `badge-notification-service.ts`, `pages/admin/Badges.tsx` (~20 appels `school-life/badges/*`) | écran en erreur |
| Messagerie | recherche, participants, présence (`components/messages/*`) | fonctions silencieusement vides |
| Préinscription parent | `admissions/public/{apply,levels,academic-years}` | parcours bloqué |
| Règles académiques | `tenants/settings/academic-rules` (GET/POST/DELETE) | page inopérante |
| Pages sans backend | visioconférences, signatures électroniques, parrainages, plans de réussite, alertes précoces | 4 déjà retirées des routes (2026-10-11) |
| Divers | `PATCH /students/{id}` (photo), `DELETE /enrollments/{id}`, `DELETE /rooms/{id}`, `GET /teachers/{id}/schedule`, `PUT /push-subscriptions/upsert`, `/finance/invoices`, `/analytics/cash-flow-forecasts` | actions sans effet ou en erreur |

Chaque groupe doit être soit branché sur une route réelle, soit retiré de
l'interface (« aucun bouton décoratif »).

## H. Constats ajoutés pendant la CI de cette PR

### BUG-RT-01 — Boucle WebSocket sans fin après déconnexion [V, R] — corrigé par #341
- `backend/app/api/v1/endpoints/core/realtime.py` : la socket n'était jamais
  lue (déconnexion invisible) et `pubsub.get_message()` était appelé sans
  délai (retour immédiat) → une tâche à pleine vitesse par connexion fermée,
  abonnement Redis jamais libéré. Vecteur d'épuisement CPU pour tout compte
  authentifié sur le VPS unique.
- Symptôme : `CancelledError` intermittent sur
  `test_active_user_connection_is_accepted` (PostgreSQL), bloquant toutes les PR.
- Reproduction déterministe : `tests/test_realtime_relay_disconnect.py`
  (3/4 en échec avant correctif).

### DEP-01 — follow-redirects 1.16.1 (GHSA-mrwp-f3q8-3g9p, HIGH) [V] — corrigé par #341
- Avis publié après le dernier run de `main` ; Security Scan échouait sur
  toute PR. Passage à 1.16.2 (lockfile seul).

### RT-02 — Instabilité résiduelle du test WebSocket [NON VÉRIFIÉ]
- `test_realtime_websocket_revocation_2026_09_28.py::TestWebSocketRejectsDeactivatedAccount::test_active_user_connection_is_accepted`
  a échoué une fois sur `main` (`6540145`) dans une exécution PostgreSQL
  locale, puis réussi sur la même suite à l'exécution suivante. CI de `main` verte.
- À confirmer par exécutions répétées (`pytest --count`) avant toute conclusion.

## I. Intégrité financière (ajouté le 2026-11-03)

### FIN-01 — Encaissements non atomiques et rejouables [V, R] — **PARTIEL** (correctif #345, non fusionné) — P0
- `POST /payments/register/` (`finance/payments.py`) lisait `paid_amount`,
  calculait en Python puis réécrivait : deux encaissements simultanés passaient
  tous deux le contrôle de trop-perçu ; la facture n'en comptait qu'un.
- Le client rejouait tout `POST` sur 502/503/504 (`src/api/client.ts`), y
  compris après validation serveur ; aucune clé d'idempotence côté paiements →
  double encaissement.
- `POST /payments/{id}/reverse/` : contrôle puis écriture en deux temps → double
  décrément de la facture. Référence en double → 500.
- Reproduction : `backend/tests/test_payment_integrity.py` — 9/12 en échec sur
  l'ancien code, 12/12 verts après correctif (PostgreSQL, threads concurrents).
- Non vérifié : factures de production déjà incohérentes (`paid_amount` ≠ somme
  des paiements `COMPLETED`) — requête de contrôle à exécuter par l'administrateur.

### CORS-01 — `X-Idempotency-Key` refusé au pré-vol [V, R] — **PARTIEL** (correctif #345) — P1
- `allow_headers` (`backend/app/main.py`) ne contenait pas l'en-tête : depuis
  une autre origine que l'API (application Capacitor, front séparé), le
  navigateur bloquait la requête — y compris les présences de la file
  hors-ligne (`src/offline/outbox.ts`). Production web non affectée (même origine via `/api`).
- Trouvé par le parcours E2E 04 de #345 ; test : `tests/test_cors_idempotency_header.py`.

### FIN-02 — Annulation d'un paiement non encaissé [V code] — **OUVERT** — P1
- `reverse_payment` accepte tout statut sauf `REVERSED` : un paiement
  `PENDING`/`FAILED` (passerelle) annulé décrémente la facture d'un montant
  jamais reçu.
- Correctif : n'annuler que `COMPLETED` ; test : annulation d'un `PENDING` → 400, facture inchangée.

### API-02 — Export comptable cassé [V] — **CORRIGÉ** (`fix/accounting-export-route`) — P1
- `src/pages/admin/AccountingExports.tsx:119` appelle `GET /payments/` (absent) ;
  la liste est `GET /payments/payments/`. Sous-ensemble prioritaire d'API-01.
- Constaté en corrigeant (même écran, tous silencieux) : filtres de date des
  factures ignorés par le serveur (50 premières factures, toutes dates) ;
  montant recalculé depuis les lignes au lieu de `total_amount` ; champs
  `invoice`/`student` au lieu de `invoices`/`students` ; factures datées par
  création et non par émission ; brouillons, factures et paiements annulés
  comptabilisés ; « 3 derniers mois » = 4 mois ; noms d'élèves écrits sans
  protection dans des CSV ouverts par Excel (injection de formule).
- Correctif : filtres `date_from`/`date_to` (+ `status` sur les paiements)
  sur les deux listes, pagination complète côté écran (échec explicite
  au-delà de 20 000 lignes plutôt que troncature), logique isolée et testée
  (`src/features/finance/utils/accountingExport.ts`), message d'erreur au lieu
  d'un export vide. Tests : `test_payment_list_period_filters.py` (9, PostgreSQL ;
  7 en échec sur l'ancien code), `accountingExport.test.ts` (17).
- Module mort retiré : `src/lib/paymentReference.ts` (appelait `GET /payments/`,
  importé nulle part — l'écran Finances utilise `/payments/sequence/`).

