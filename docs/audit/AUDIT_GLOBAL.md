# Audit global — état réel au 2026-11-02

**Commit audité : `c28b482` (`main`, 2026-10-27 07:19 +0100)** — « fix(audit): client
audit entries work, are namespaced and bounded (#339) ». CI de `main` sur ce
commit : verte (run 40460387357).

Ce document distingue systématiquement :
**[V]** constat vérifié (commande exécutée ou code lu, preuve citée) ·
**[R]** anomalie reproductible · **[P]** risque potentiel (non démontré) ·
**[A]** amélioration proposée · **[H]** hypothèse commerciale.

Documents liés : `BUGS_AND_GAPS.md` (défauts détaillés),
`BACKLOG_PRIORITIZED.md` (chantiers ordonnés). Les autres livrables demandés
(benchmark, stratégie, plan national, données de démo…) ne sont **pas encore
produits** — voir § 10.

---

## 1. Contrôles exécutés (baseline)

| Contrôle | Commande | Résultat | Remarque |
|---|---|---|---|
| Backend pytest (SQLite) | `python -m pytest tests/ -q` (Python 3.11) | **1571 passed, 0 failed, 735 skipped** | 735 tests ne tournent que sur PostgreSQL (RLS réelle) : non exécutés ici, exécutés par la CI. `test_start_sh_db_resolution.py` (12 tests) désélectionné : exige un PostgreSQL joignable. |
| Backend pytest — 1re exécution | idem, sur un `backend/test.db` préexistant | 29 échecs | Tous verts sur base vierge → **suite non hermétique** (identifiants fixes `REG-OWN-1`, slugs…) : un `test.db` résiduel fait échouer 21 tests. [V] |
| Vitest | `npx vitest run` | **69 fichiers, 399 tests, tous verts** | |
| TypeScript strict | `tsc -p tsconfig.app.json --noEmit` | **184 erreurs** | = `ts-baseline.json` (le contrôle CI interdit seulement d'augmenter). |
| ESLint | `eslint .` | **0 erreur, 2 048 avertissements** | budget CI `--max-warnings 2116`. Répartition : `no-explicit-any` 1 416, `no-unused-vars` 573, `exhaustive-deps` 33, `only-export-components` 23, `no-console` 3. |
| Routes API | OpenAPI de `app.main` | **631 opérations** | 547 décorateurs `@router` dans `endpoints/` + alias. |
| Appels front → API | analyse statique de `apiClient.<verbe>("…")` dans `src/` | **997 appels, 91 sans route correspondante** | Heuristique (chemins littéraux uniquement, segments `${}` assimilés à un paramètre) : à confirmer appel par appel — voir `BUGS_AND_GAPS.md` § G. |

Non exécutés dans cet audit (et donc **non vérifiés**) : suite PostgreSQL/RLS,
E2E Playwright (smoke et parcours), build de production, tests de charge k6,
restauration de sauvegarde, `npm run check:i18n`.

*Erratum 2026-11-02* : la première version de ce document affirmait qu'aucun
script de restauration n'était versionné — c'est faux (voir OPS-01 corrigé
dans `BUGS_AND_GAPS.md`).

## 2. Architecture constatée

```
navigateur / Capacitor (React 18 + Vite 7, PWA, Dexie hors-ligne)
   │  JWT HS256 en localStorage/sessionStorage, X-Tenant-ID réservé SUPER_ADMIN
   ▼
nginx (frontend) ──/api──► FastAPI (gunicorn) ── SQLAlchemy sync ──► PostgreSQL 16 (RLS ENABLE+FORCE,
   ▲                          │  middlewares : request_id, tenant,       rôle runtime NOBYPASSRLS)
Caddy (TLS, proxy commun)     │  metrics, quota, slowapi
                              ├──► Redis 7 (révocation jti/token_version, sessions, rate-limit, file ARQ)
                              ├──► MinIO (stockage objet, core/storage.py)
                              └──► Groq (IA), SMTP, SMS, Mobile Money (Wave/OM/MTN/CinetPay/PayTech)
Worker ARQ (crons : expiration abonnements, purges, inactivité) ── worker_db_session(tenant)
Sauvegarde : dump quotidien local → copie chiffrée Backblaze B2 (cron 03:00) ; surveillance.py toutes les 5 min (email)
```

- Backend : 66 modules d'endpoints (`core/` 22, `academic/` 16, `finance/` 2,
  `operational/` 16 + alias), 52 modèles, 17 services, 84 migrations Alembic,
  244 fichiers de tests. [V]
- Frontend : 183 pages, 7 portails routés (admin, enseignant, élève, parent,
  alumni, département, public), 5 locales. [V]
- Production : VPS OVH unique (Docker Compose) depuis 2026-10-24 ; Azure
  abandonné. **Point unique de défaillance** (une machine, une base, un Redis). [V]
- Dette d'architecture notable [V] : `aliases.py` (27 routeurs d'alias pour des
  URL attendues par le front), deux mécanismes de quota qui ne se parlent pas
  (`middlewares/quota.py` vs `services/saas_quota_service.py`, documenté dans
  l'en-tête du middleware), 90 occurrences de `text(f"…")` à auditer (les
  échantillons lus n'interpolent que des fragments constants), 18
  `except Exception: pass` restants.

## 3. Inventaire fonctionnel (synthèse par domaine)

Statuts : COMPLET (preuve par test fonctionnel ou E2E) · PARTIEL · DÉFECTUEUX ·
SIMULÉ · ABSENT · NON VÉRIFIÉ. Les preuves « E2E » renvoient aux 5 parcours de
`tests/e2e/journeys/` (job CI `e2e-journeys`, **non obligatoire**).

| Domaine | Statut | Preuve / constat |
|---|---|---|
| Authentification (login, MFA TOTP/email/secours, reset) | COMPLET | `test_mfa_enforcement.py`, `test_token_lifecycle.py`, entrées 2026-10-24 de `STATUT_ACTUEL.md` |
| **Sessions / appareils connectés** | **SIMULÉ** | `getActiveSessions()` renvoie `[]`, `terminateSession()` renvoie `true` sans appel serveur ; toast « Session terminée » affiché (`src/hooks/useLoginTracking.ts`, `src/pages/admin/SecuritySessions.tsx:53-71`) |
| **Historique des connexions** | **DÉFECTUEUX** | Aucun audit serveur de connexion (aucun `log_audit` dans `auth.py`/`mfa.py`) ; `trackLogin()` jamais appelé ; `getLoginHistory()` lit `data.items` alors que `GET /audit/` renvoie un tableau → toujours vide |
| Déconnexion / déconnexion globale | COMPLET (avec défaut) | `/auth/logout/`, `/auth/logout-all/` testés ; registre de sessions Redis incohérent (voir BUG-SESS-03) |
| Multi-tenant / RLS | COMPLET (prod) | 117/117 tables `ENABLE+FORCE`, tests sous rôle restreint (`test_*_rls_restricted_role.py`) |
| RBAC (16 rôles) | COMPLET | `ROLE_PERMISSIONS`, `docs/PERMISSIONS_MATRIX.md`, E2E 02 |
| Élèves / inscriptions | COMPLET (parcours nominal) | E2E 01 ; imports CSV robustes (#301/#302) |
| Notes, évaluations, bulletins PDF | COMPLET (parcours nominal) | E2E 03 (WeasyPrint) |
| Présences | COMPLET (parcours nominal) | E2E 05 |
| Frais, factures, paiement Mobile Money **reçu** | COMPLET (parcours nominal) | E2E 04 |
| Paiement en ligne par passerelle (CinetPay/PayTech) | PARTIEL | webhook signé testé (`test_payment_webhook_events.py`) ; initiation jamais jouée contre un sandbox |
| Facturation SaaS (plans, essai 30 j, lecture seule 15 j, blocage) | PARTIEL | élèves et campus appliqués ; **utilisateurs, requêtes IA, exports : mesurés mais non bloquants** (`saas_quota_service`, `hard_enforce=False`) |
| Enseignement supérieur LMD | PARTIEL | facultés, départements, semestres, ECTS par matière, contrôle de progression (`services/progression.py`) ; **absents** : unités d'enseignement, compensation, jurys/délibérations, stages, mémoires |
| Délibérations, rattrapages, passage/redoublement | ABSENT / NON VÉRIFIÉ | aucun modèle ni service dédié trouvé |
| RH (dossiers, contrats, congés, bulletins de paie) | NON VÉRIFIÉ | 32 routes `hr.py`, 4 fichiers de tests d'autorisation ; aucun parcours métier E2E |
| Bibliothèque, inventaire, clubs, sondages, incidents, alumni, kiosque | NON VÉRIFIÉ | routes + tests d'autorisation ; aucun parcours fonctionnel |
| Admissions / préinscription publique | PARTIEL | 15 routes ; la page parent `PreRegistration` appelle 3 routes `admissions/public/*` absentes |
| Messagerie / communication | PARTIEL | recherche, participants, présence appelés côté front sans route |
| Gamification / badges | DÉFECTUEUX | `src/lib/badge-api.ts` appelle ~15 routes `school-life/badges/*` inexistantes |
| Visioconférences, signatures électroniques, parrainages, plans de réussite, alertes précoces | ABSENT (backend) | pages front sans API ; 4 d'entre elles retirées des routes le 2026-10-11 |
| Tableau de bord IA (« insights ») | **SIMULÉ en partie** | tendances sur 6 mois générées par `Math.random()` (`src/hooks/useAIInsights.ts:184-186`) ; axes « Engagement » et « Progression » aléatoires (`src/components/admin/ai/AICharts.tsx:30-31`) |
| Assistant IA (chat, audit) | COMPLET (borné) | permissions et limites du 2026-10-25 |
| Hors-ligne (PWA, Dexie) | NON VÉRIFIÉ | aucun test de coupure réseau / synchronisation trouvé |
| Ministère / tutelle | PARTIEL | `ministry.py` (2 routes, agrégats `tenants`) |
| RGPD (export, suppression) | NON VÉRIFIÉ | 12 routes, 3 fichiers de tests |
| Sauvegardes | PARTIEL | dump quotidien + copie chiffrée B2 + surveillance ; script de restauration et exercice CI (dump du dépôt, contrôle `alembic_version` seul) ; **restauration du format de production depuis B2 non prouvée de bout en bout, RTO non mesuré** |

La matrice exhaustive écran par écran (`FEATURE_MATRIX.md`) reste à produire :
elle exige de jouer chaque page, ce qui n'a pas été fait dans cet audit.

## 4. Sécurité — synthèse

| # | Constat | Gravité | Type |
|---|---|---|---|
| S1 | Révocation de session individuelle impossible ; l'UI affiche un faux succès | **P0** | [V] |
| S2 | Aucun événement d'authentification audité côté serveur (succès, échec, MFA, logout, changement de mot de passe) | **P0** | [V] |
| S3 | Registre des sessions actives (Redis) : TTL 30 min alors qu'une session vit jusqu'à 7 jours ; chaque `/auth/refresh/` ajoute un jti sans retirer l'ancien → le plafond « 5 sessions » ne mesure rien de réel et peut refuser un rafraîchissement légitime (429) en usage multi-onglets/appareils | P1 | [V] code lu ; [P] impact utilisateur non mesuré |
| S4 | Jeton d'accès en `localStorage` (exposé à toute XSS) ; 5 `dangerouslySetInnerHTML` à revoir | P1 | [P] |
| S5 | Quotas IA / exports non bloquants : coût fournisseur IA non plafonné par établissement | P1 | [V] |
| S6 | Production mono-VPS : pas de redondance, RTO dépendant d'une remise en route manuelle | P1 | [V] |
| S7 | 90 `text(f"…")` à auditer formellement (aucune injection trouvée dans l'échantillon lu) | P2 | [P] |

Détails, scénarios et tests attendus : `BUGS_AND_GAPS.md`.

## 5. Dette technique

- TypeScript : 184 erreurs strictes (plancher CI), dont surtout TS7006
  (paramètres non typés) et code mort. Objectif : décroissance par lots.
- ESLint : 2 048 avertissements (budget 2 116) — 69 % `any`, 28 % variables
  inutilisées.
- 91 appels front vers des routes absentes (code mort ou fonctionnalités
  inachevées présentées dans l'interface).
- Suite pytest non hermétique sur une base SQLite réutilisée.
- Deux systèmes de quotas parallèles ; alias d'URL (`aliases.py`).
- Couverture backend exigée par la CI : 43 % (`--cov-fail-under=43`).

## 6. Tests et CI/CD

- CI (`ci.yml`) : lint (budget), type-check (plancher), Vitest, pytest SQLite
  **et** PostgreSQL (couverture ≥ 43 %), scan npm audit, E2E smoke ;
  `e2e-journeys` sur vraie stack **non obligatoire**. Ruleset `protect-main`
  (PR obligatoire, 5 checks requis). [V] d'après `STATUT_ACTUEL.md` et `ci.yml`.
- Workflows Azure (`deploy-*.yml`, `build-images.yml`) inactifs/manuels ;
  le déploiement VPS (`deploy/vps/deploy.sh`) est manuel, hors CI.
- Manquent : tests hors-ligne, accessibilité automatisée, charge reproductible
  en CI, restauration automatisée.

## 7. Préparation à la production

| Axe | État |
|---|---|
| Isolation tenant | Solide (RLS forcée, rôle NOBYPASSRLS, tests dédiés) |
| Authentification | Solide sauf gestion des sessions / audit des connexions (S1–S3) |
| Disponibilité | Faible : un seul VPS, pas de bascule |
| Sauvegarde / restauration | Partielle : sauvegardes et exercice CI en place ; restauration depuis B2 non journalisée, RTO inconnu |
| Observabilité | Partielle : logs JSON, `/metrics/`, surveillance par email toutes les 5 min, Sentry optionnel |
| Facturation | Partielle : plans et blocage d'abonnement en place, quotas IA/exports/utilisateurs non appliqués |

**Verdict : exploitable pour un nombre restreint d'établissements pilotes ;
pas prêt pour un déploiement national** (redondance, restauration prouvée,
charge mesurée et complétude métier universitaire manquantes).

## 8. Score de maturité

**Méthode** : 8 axes notés de 0 à 5 sur preuves de cet audit uniquement
(0 = absent, 1 = ébauche, 2 = partiel, 3 = fonctionnel prouvé sur le parcours
nominal, 4 = prouvé + testé en régression + documenté, 5 = éprouvé en charge et
en exploitation). Moyenne non pondérée. **Limites** : suites PostgreSQL et E2E
non exécutées localement (CI verte prise comme preuve), aucune mesure de
charge, aucun test utilisateur.

| Axe | Note | Justification |
|---|---|---|
| Sécurité & isolation | 3,5 | RLS forcée et testée, MFA, révocation ; sessions et audit des connexions défaillants |
| Cœur scolaire (élèves, notes, bulletins, présences) | 3 | 4 parcours E2E nominaux ; délibérations, passage, rattrapages absents |
| Enseignement supérieur | 1,5 | ECTS et progression seulement |
| Finances scolaires | 3 | facture → paiement prouvé ; passerelle en ligne non jouée, rapprochement/remboursement non vérifiés |
| Facturation SaaS | 2,5 | plans, essai, lecture seule ; quotas partiels |
| Qualité du code & tests | 2,5 | 1 970 tests verts ; dette TS/ESLint élevée, suite non hermétique |
| Exploitation (dispo, sauvegarde, observabilité) | 2 | mono-VPS, restauration non outillée |
| Expérience & mobile/hors-ligne | 2 | i18n 5 langues ; fonctions simulées/inachevées visibles ; hors-ligne non vérifié |
| **Moyenne** | **2,5 / 5** | |

## 9. Plan d'action et PR

Voir `BACKLOG_PRIORITIZED.md`. Premier chantier P0 : **sessions serveur et
audit des authentifications** (BUG-SESS-01 à 04) — changement important
(auth, nouveau contrat d'API, RBAC) soumis à validation du plan avant
implémentation, conformément à `CLAUDE.md`.

## 10. Livrables non encore produits (honnêteté de périmètre)

| Livrable | Raison |
|---|---|
| `FEATURE_MATRIX.md` exhaustive | exige le parcours de chaque écran (183 pages) |
| `COMPETITOR_BENCHMARK.md` | exige une recherche web sourcée et datée — aucun chiffre ni concurrent ne sera cité sans source |
| `SECURITY_AUDIT.md` (ASVS complet), `TECH_DEBT.md` détaillé, `TEST_STRATEGY.md`, `PRODUCT_ROADMAP.md`, `NATIONAL_DEPLOYMENT_PLAN.md`, `DEMO_DATA_PLAN.md`, `BUSINESS_STRATEGY.md` | prochains lots, ordonnés dans `BACKLOG_PRIORITIZED.md` |
