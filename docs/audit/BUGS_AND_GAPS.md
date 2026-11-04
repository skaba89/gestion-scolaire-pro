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

### OPS-01 — Restauration de la production non prouvée de bout en bout [V] — **CORRIGÉ** le 2026-11-04 (restauration B2 démontrée, réserves ci-dessous)
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
- 2026-11-03 : script d'exercice livré. Validé sur un dump produit avec les
  options exactes du service `db-backup` (`pg_dump -Z1 --schema=public
  --blobs`) : cas fidèle → RÉUSSI ; archive corrompue, table tenant sans
  `FORCE`, schéma sans `USAGE` pour `schoolflow_app`, politique ouverte
  (`USING (true)`) → ÉCHEC détecté à chaque fois. Reste : l'exécuter sur le
  VPS contre B2 et consigner le rapport (RTO/RPO réels).
- **2026-11-04 — exécution sur le VPS de production, depuis B2 : RÉUSSI**
  (`docs/audit/preuves/restauration-b2-20261104.md`). Dump de la nuit
  déchiffré (4 s), restauré sans erreur (5 s) : 133 tables, révision
  `20261026_0001` = production, 122 tables RLS `ENABLE+FORCE` = production,
  0 orphelin, rôle restreint fail-closed. **RPO 5 h, RTO technique 19 s.**
- Réserves : la production ne contient encore aucun élève (1 établissement,
  2 comptes) — le contrôle « un établissement ne voit que ses élèves » n'a
  pu être joué que sur jeu d'essai ; RTO hors décision humaine et
  reconstruction d'une machine ; exercice à refaire chaque trimestre et dès
  que des données réelles existent ; mono-VPS (OPS-02) inchangé.
- La 1re exécution (même jour) a échoué à cause du script : le dump de
  production ne recrée pas le schéma `public`, que le script supprimait.
  Corrigé (suppression seulement si le dump le recrée), testé sur les deux
  variantes.
- Constaté en le développant : la procédure manuelle du README restaurait
  dans la base existante sans `ON_ERROR_STOP` (erreurs « already exists »
  ignorées) — avertissement ajouté dans `deploy/vps/README.md`.

### OPS-02 — Mono-VPS [V] — **OUVERT**
- Aucune redondance ; RPO ≈ 24 h (dump quotidien), RTO non mesuré.

## E. Qualité

### QA-01 — Suite pytest non hermétique [R] — **CORRIGÉ** (`test/hermetic-pytest-db`, 2026-11-03)
- Reproduction : lancer `python -m pytest tests/ -q` avec un
  `backend/test.db` préexistant → 21 échecs (`UNIQUE constraint failed:
  students.registration_number`, `tenants.slug`) ; base supprimée → 0 échec.
- Correctif : fixture de session qui recrée la base, ou identifiants uniques.
- 2026-11-03 : 19 échecs à la 2e exécution sur `main` ; en PostgreSQL aussi,
  `test_payment_business_rules.py` (références fixes `REC-TEST-1`…) échoue
  en 409 à la 2e exécution sur la même base.
- Cause unique : valeurs fixes soumises à une contrainte d'unicité
  (`registration_number`, `tenants.slug`, `payments.reference`) dans 6
  fichiers. Correctif : suffixe unique par exécution, assertions comparées à
  la valeur générée (rien de ce que les tests vérifient n'a changé).
- Preuve : SQLite, même base, 2 exécutions complètes : 1 596 passed / 0
  failed puis 1 596 / 0. PostgreSQL, même base, 8 fichiers concernés : 74/74
  puis 74/74.
- **Précision (2026-11-03, mesure ultérieure)** : la PR #349 indiquait
  « SQLite et PostgreSQL » ; en PostgreSQL, seuls les 8 fichiers ci-dessus
  avaient été rejoués. Mesure contrôlée sur base vierge, 2 exécutions d'un
  sous-ensemble de 345 tests (admissions, parents, permissions, sécurité) :
  un seul test échoue à la 2e — `test_bootstrap.py`, par construction (la
  création du premier administrateur ne fonctionne qu'une fois par base).
  Résiduel connu ; la suite PostgreSQL complète n'a pas été rejouée deux fois.

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

### FIN-02 — Annulation d'un paiement non encaissé [V code] — **CORRIGÉ** (`fix/payment-reverse-completed-only`) — P1
- `reverse_payment` accepte tout statut sauf `REVERSED` : un paiement
  `PENDING`/`FAILED` (passerelle) annulé décrémente la facture d'un montant
  jamais reçu.
- Correctif : n'annuler que `COMPLETED` ; test : annulation d'un `PENDING` → 400, facture inchangée.
- 2026-11-03 : `PENDING`, `FAILED` et `REFUNDED` refusés (400, statut cité),
  facture inchangée — 3 tests en échec sur l'ancien code.
- Constaté au passage : l'historique des paiements affichait « Validé » pour
  tout paiement non annulé, y compris en attente ou échoué ; libellés
  réels (`features/finance/utils/paymentStatus.ts`) et montant en vert
  seulement s'il est encaissé.

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

## J. Admissions (ajouté le 2026-11-03)

### SEC-ADM-01 — Réinscription publique sans vérification du demandeur [V, R] — **CORRIGÉ** (`fix/public-reenroll-verify-requester`) — P1
- `POST /admissions/public/reenroll/` (sans authentification) accepte tout
  `student_id` avec n'importe quel `parent_email` : il ne vérifie pas que
  l'e-mail est celui d'un parent de l'élève (contrairement à
  `/public/verify-student/`, qui exige matricule + e-mail).
- Effet : une personne disposant de l'identifiant (UUID) d'un élève dépose
  une demande à son nom avec sa propre adresse ; `GET /public/status/` lui
  renvoie ensuite le nom de l'élève et le niveau demandé. L'UUID est difficile
  à deviner : risque potentiel, non démontré.
- Correctif attendu : exiger le couple matricule + e-mail parent (comme
  `verify-student`) ou un jeton émis par `verify-student`. Test : e-mail non
  rattaché à l'élève → 404, aucune demande créée.
- 2026-11-03 : reproduit (e-mail quelconque accepté) puis corrigé —
  `registration_number` obligatoire, matricule + e-mail revérifiés par le
  même critère que `verify-student` (`_find_student_for_requester`), même
  404 quel que soit le critère manquant (pas d'oracle). Année et niveau de
  `apply` et `reenroll` contrôlés comme appartenant à l'établissement (400).
  Tests : `test_public_reenroll_requester.py` (10 ; 8 en échec sur l'ancien
  code). `test_admission_reenroll_cast.py` validait le comportement
  dangereux (élève sans parent, e-mail arbitraire) : adapté.
- `POST /public/apply/` : `level_id` / `academic_year_id` reçus ne sont pas
  vérifiés comme appartenant à l'établissement (règle d'or n° 2) — même lot.

### RBAC-01 — Permissions d'admissions désynchronisées front / back [V] — **OUVERT** — P2
- `src/lib/permissions.ts` déclare `admissions:manage` et `admissions:convert` ;
  le backend ne connaît que `admissions:write` (règle d'or n° 3). Effet :
  l'affichage des actions d'admission ne reflète pas exactement les droits
  réels (le backend reste l'autorité). À aligner avec un test de parité.

### API-03 — Pré-inscription parent bloquée [V] — **CORRIGÉ** (`fix/parent-preregistration-routes`) — P1
- `/parent/pre-registration` appelait `GET /admissions/public/academic-years/`,
  `/public/levels/` et `GET /public/apply/` (inexistants) : aucune
  réinscription possible par le parent.
- Constaté en corrigeant : « l'année suivante » était calculée par position
  dans une liste triée de la plus récente à la plus ancienne → la page
  proposait l'année **précédente**.
- Correctif : années et niveaux via les routes authentifiées existantes
  (`settings:read`) ; nouvelles routes `GET /admissions/reenrollments/mine/`
  et `POST /admissions/reenrollments/` (permission `admissions:reenroll`,
  PARENT) avec contrôle d'appartenance, année/niveau du même établissement,
  doublon 409, coordonnées du parent lues sur son compte, audit. Tests :
  `test_parent_reenrollment.py` (11, PostgreSQL, 11/11 en échec sur l'ancien
  code), `reenrollment.test.ts` (5). Cliquet API : 79 → 76.

### ADM-02 — Vérification d'élève du portail public en erreur 500 [V, R] — **CORRIGÉ** (`fix/public-reenroll-verify-requester`) — P1
- `POST /admissions/public/verify-student/` — 1re étape de la réinscription
  publique (`/:slug/reinscription`) — joignait `students.parent_id` et
  `students.level_id`, colonnes qui n'existent ni dans le modèle ni dans
  aucune migration : `UndefinedColumn`, **500 pour tout parent**. Aucun test
  n'exerçait cette route.
- Exploitation réelle non vérifiée (journaux de production non consultés),
  mais le code est sans ambiguïté : le parcours ne pouvait aboutir.
- Correctif : lien parent par `parent_students` → `users` (ou e-mails de la
  fiche élève), niveau actuel par l'inscription active → classe → niveau.

## K. Messagerie (ajouté le 2026-11-04)

### MSG-01 — Présence, « en train d'écrire » et recherche sans route [V] — **CORRIGÉ** (`fix/messaging-routes`) — P1
- La messagerie (`MessengerInterface`, toutes les pages Messages) appelait
  `GET /communication/presence/{id}/`, `/communication/presence/`,
  `…/conversations/{id}/participants/` et `/communication/messages/search/`,
  inexistants. Effets : **chaque contact toujours affiché « hors ligne »**,
  indicateur « en train d'écrire » jamais affiché (il appelait en plus
  `GET /users/`, interdit aux élèves et aux parents), recherche toujours
  « aucun résultat ». La présence était pourtant déjà enregistrée par
  `PUT /presence/` (table `user_presence`, RLS).
- Compteur de messages non lus du tableau de bord parent : mauvaise adresse
  et mauvais champ → toujours 0.
- `MessagingInterface.tsx` (732 lignes, appels `participants` et `mark-read`)
  n'était importé nulle part : supprimé.
- Correctif : `GET /communication/presence/{user_id}/` (seulement une
  personne avec qui l'on partage une conversation, sinon 404),
  `GET /communication/conversations/{id}/typing/` (participants seulement,
  fenêtre de 8 s, prénoms inclus), `GET /communication/messages/search/`
  (ses conversations seulement, motifs `LIKE` échappés, 2 à 100 caractères,
  50 résultats max). Tout est filtré par établissement. Tests :
  `test_messaging_presence_search.py` (13, PostgreSQL ; 9 en échec sur
  l'ancien code), `TypingIndicator.test.tsx` (2). Cliquet API : 76 → 70.

## M. Badges (ajouté le 2026-11-04)

Deux fonctions distinctes portent le nom « badge » dans le code.

### GAME-01 — Gamification sans backend [V] — **RETIRÉE** (`chore/hide-badges`, décision du propriétaire : masquer) — P2
- Badges de récompense, classement, journaux de déblocage, e-mails de badge :
  `badge-api.ts`, `badge-notification-service.ts`, `useBadges.ts`,
  `BadgeWidget`, `BadgeNotification`, `BadgeDisplay`,
  `gamification-integration-examples.ts` (1 916 lignes) — ~19 appels vers
  des routes inexistantes, **aucun écran affiché ne les importait**.
- Supprimés ; 6 erreurs TypeScript retirées avec eux (plancher 184 → 178).
  Reconstruction éventuelle : nouveau module avec backend (P2).

### BADGE-01 — Badges QR des élèves : création, statut et suppression sans route [V] — **OUVERT** — P1
- La page `/admin/badges` n'est **pas** de la gamification : ce sont les
  cartes badges QR des élèves (impression, scan, pointages). La liste
  fonctionne (`GET /school-life/badges/`), mais `POST /school-life/badges/`,
  `PUT /school-life/badges/{id}/` et `DELETE /school-life/badges/{id}/`
  n'existent pas : un badge ne peut être ni créé, ni suspendu, ni supprimé
  depuis l'écran.
- Correctif attendu : routes d'écriture (`students:write` ou équivalent),
  élève du même établissement, audit ; test 403 et cross-tenant.
