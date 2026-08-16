# Audit final de préparation à la production — Academy Guinéenne

**Date** : 2026-08-16
**Commit audité** : `d010469` (`main`, après fusion de la PR #106) — les
PR #107 et #108 (voir ci-dessous) restent ouvertes au moment de la
rédaction de ce rapport, en attente de revue.
**Session** : agent IA, exécution autonome sur ce dépôt, sans accès aux
dashboards Render/Resend/Meta ni identifiants réels.

Ce rapport clôt le plan de finalisation en 9 phases demandé ("Finaliser
gestion-scolaire-pro avant commercialisation large"), combiné avec la
résolution de l'audit "round 2" publié plus tôt dans la même session.
Chaque section renvoie vers le document source détaillé plutôt que de
dupliquer son contenu.

---

## Pull requests produites cette session

| PR | Titre | Statut |
|---|---|---|
| [#105](https://github.com/skaba89/gestion-scolaire-pro/pull/105) | Phase 1 (échappement email admin) + Phase 2 (DOMPurify testé) | ✅ Fusionnée |
| [#106](https://github.com/skaba89/gestion-scolaire-pro/pull/106) | Phase 6 (migration WhatsApp absence/note/bulletin vers Arq) + fix CI Windows | ✅ Fusionnée |
| [#107](https://github.com/skaba89/gestion-scolaire-pro/pull/107) | 6 findings restants de l'audit round 2 (High/Medium/Low) | 🟡 Ouverte, CI verte, en attente de revue |
| [#108](https://github.com/skaba89/gestion-scolaire-pro/pull/108) | Phases 4/5/7/8 (documentation : validation, templates, charge, runbook) | 🟡 Ouverte, en attente de revue |

---

## Fichiers modifiés / migrations ajoutées / tests ajoutés

**Backend (code)** :
- `backend/app/workers/tasks.py` — 3 nouveaux jobs Arq (absence/grade/
  bulletin WhatsApp)
- `backend/app/api/v1/endpoints/operational/communication.py` — routage
  async du volet WhatsApp de `send-notification-email/`
- `backend/app/api/v1/endpoints/core/search.py` — rate limit ajouté
- `backend/app/api/v1/endpoints/core/auth.py` — expiration du bypass de
  charge
- `backend/app/core/config.py` — `LOAD_TEST_BYPASS_EXPIRES_AT`
- `backend/app/main.py` — `_check_db_pool()` corrigé
- `backend/scripts/pip_audit_severity_gate.py` (nouveau)

**Migrations** (toutes additives, aucune supprimée) :
- `backend/alembic/versions/20260816_0001_index_push_subscriptions.py`

**Frontend (code)** :
- `src/pages/public/PublicPageView.tsx` — exports additifs
  (`TextSection`/`CustomHTMLSection`)
- `src/components/public-pages/SectionsBuilder.tsx` — 7 `aria-label`

**Tests ajoutés** (13 nouveaux fichiers/suites, résumé — voir chaque PR
pour le détail complet) :
- `backend/tests/test_public_form_notifications.py` (+1 cas)
- `src/pages/public/__tests__/PublicPageView.sections.test.tsx` (nouveau)
- `backend/tests/test_whatsapp_absence_grade_bulletin_jobs.py` (nouveau,
  10 cas)
- `backend/tests/test_backup_scripts.py` (skip Windows corrigé)
- `backend/tests/test_search_rate_limit.py` (nouveau)
- `backend/tests/test_health.py` (+4 cas)
- `backend/tests/test_push_subscriptions_index_migration.py` (nouveau)
- `backend/tests/test_pip_audit_severity_gate.py` (nouveau, 8 cas)
- `backend/tests/test_login_rate_limit_bypass.py` (+3 cas)
- `src/components/public-pages/__tests__/SectionsBuilder.a11y.test.tsx`
  (nouveau)

**Documentation** :
- `docs/WHATSAPP_NOTIFICATIONS.md`, `docs/PRODUCTION_VALIDATION_RESULTS.md`
  (mis à jour) ; `docs/PRODUCTION_RUNBOOK.md`, `docs/LOAD_TEST_PLAN.md`,
  `docs/LOAD_TEST_RESULTS.md`, ce fichier (nouveaux)

---

## Résultats des tests

| Suite | Résultat |
|---|---|
| Backend (`pytest tests/ -v`, SQLite) | **689 passed, 213 skipped, 0 failed** |
| Backend (CI, PostgreSQL réel + migrations) | ✅ vert sur PR #105/#106/#107 (voir liens CI ci-dessus) |
| Frontend `type-check` | ✅ propre |
| Frontend `test -- --run` (nouveaux fichiers) | ✅ passants (16+ tests DOMPurify/sanitize, 2 a11y SectionsBuilder) |
| E2E smoke (Playwright) | ✅ vert en CI (PR #105/#106/#107) |
| Backup scripts sous Windows local | ✅ `skipped` proprement (10 tests, corrigé cette session — échouaient auparavant avec `WinError 193`) |

---

## Statut CI (GitHub Actions)

**Réelle, pas seulement déclarée localement** — vérifiée en observant de
vraies exécutions GitHub Actions (pas de simulation) :
- PR #105 : 5 jobs verts (Backend, Backend Tests PostgreSQL, Browser
  Smoke, Frontend, Security Scan) — fusionnée.
- PR #106 : idem, tous verts — fusionnée.
- PR #107 : tous verts au moment de la rédaction.
- Les jobs Linux-only (scripts de backup) tournent normalement en CI ;
  corrigés cette session pour ne plus échouer sur une exécution locale
  Windows (`os.name != "posix"` → skip propre, voir PR #107).

---

## Render / Resend / WhatsApp Meta

Voir [`docs/PRODUCTION_VALIDATION_RESULTS.md`](../PRODUCTION_VALIDATION_RESULTS.md)
pour le détail complet et honnête, ligne par ligne. Résumé :

| Composant | Statut |
|---|---|
| API Render (`/health/live`, `/health/ready`) | ✅ Vérifié réellement le 2026-08-16 (cette session, accès navigateur direct) — sain |
| Frontend Render | ✅ Vérifié réellement le 2026-08-16 — charge complètement, tenant pilote (Université La Source) visible |
| Worker Arq | 🟡 Vérifié indirectement (Redis joignable via `/health/ready`) |
| Domaine Resend (SPF/DKIM/DMARC), emails réellement reçus | ⚪ **Non vérifiable depuis cet environnement** — nécessite un accès dashboard Resend/boîte mail réelle |
| WhatsApp Meta (webhook réel, message réel envoyé/reçu, statuts delivered/read réels) | ⚪ **Non vérifiable depuis cet environnement** — simulé et testé unitairement uniquement (voir `docs/WHATSAPP_REAL_VALIDATION.md`) |
| Templates Meta soumis/approuvés | ❌ **Aucun soumis à ce jour** — blocage business connu et documenté (`docs/WHATSAPP_NOTIFICATIONS.md`) pour tout envoi WhatsApp proactif hors fenêtre 24h |

**Ces limites ne sont pas des échecs cachés** — elles sont documentées
explicitement partout où elles s'appliquent, avec la raison exacte
(absence d'accès à cet environnement), jamais présentées comme "validé".

---

## Statut sécurité email (Phase 1)

`send_public_form_submission_alert` échappe `name`/`email`/`subject`/
`message` via `html.escape()` avant construction du HTML — vérifié
présent et testé (4+1 tests, `test_public_form_email_escaping.py` et
`test_public_form_notifications.py`). Un échec d'envoi email (ex. panne
Resend) ne fait jamais échouer le job — testé explicitement cette
session.

## Statut XSS / `custom_html` (Phase 2)

DOMPurify en dépendance de production, `initSanitize()` appelé au
démarrage, `sanitizeHtml()` utilisé dans `TextSection` et
`CustomHTMLSection` avant tout `dangerouslySetInnerHTML` — vérifié
présent. Nouveau test cette session confirmant que ces deux composants
**passent réellement par** `sanitizeHtml()` (pas seulement que la
fonction est sûre en isolation) : script injecté neutralisé, `img`/
`iframe` hors liste blanche supprimés.

## Statut RGPD

Non ré-audité en détail cette session (déjà couvert par les phases RGPD
antérieures du projet — rate limits, retention `PUBLIC_FORM_RETENTION_DAYS`,
purge automatique nocturne des soumissions publiques). Aucune régression
introduite : la purge (`purge_old_public_form_submissions`) et son
paramétrage restent inchangés.

## Statut charge

Voir [`docs/LOAD_TEST_RESULTS.md`](../LOAD_TEST_RESULTS.md) pour le
détail complet. Résumé : palier 10 tenants validé (résultats sains),
palier 100 tenants exécuté mais **non représentatif** (matériel de
développement, pas une instance dimensionnée), paliers 1000/10000
jamais exécutés (script prêt, infrastructure de staging à provisionner —
décision opérateur).

---

## P0 / P1 / P2 restants

**P0 (bloquant, doit être résolu avant tout déploiement)** : aucun
identifié cette session.

**P1 (sécurité/fiabilité, à traiter avant commercialisation large)** :
1. `build_service_from_db()` (`backend/app/services/notifications.py`)
   utilise une requête SQL brute qui ne trouve silencieusement aucune
   ligne sur SQLite (mismatch de format UUID) — bug découvert cette
   session pendant l'écriture des tests Phase 6, **flag séparé déjà
   ouvert** (voir tâche en arrière-plan créée cette session : "Fix
   build_service_from_db returning None on SQLite"). N'affecte pas
   Postgres/production, mais masque silencieusement des bugs de test en
   local.
2. Templates WhatsApp Meta non soumis — bloque tout envoi WhatsApp
   proactif réel (rappel de paiement, alerte d'absence) hors fenêtre 24h.
   Action business, pas technique.
3. Validation Render/Resend/Meta réelle jamais exécutée par un opérateur
   humain avec accès complet — checklists prêtes
   (`docs/RENDER_PRODUCTION_VALIDATION.md`, `docs/WHATSAPP_REAL_VALIDATION.md`),
   jamais parcourues de bout en bout.

**P2 (amélioration, non bloquant)** :
1. Palier de charge 100/1000 tenants jamais exécuté sur un environnement
   représentatif de la production.
2. Canal de contact support client non défini (`docs/PRODUCTION_RUNBOOK.md`,
   §7).
3. Import Enseignants/Parents toujours indisponible (limite documentée
   ailleurs, `docs/IMPORT_EXCEL_READINESS.md`, non ré-auditée cette
   session).

---

## Verdicts

### Pilote payant (1 établissement, ex. Université La Source)
**✅ Prêt.** Le tenant pilote réel est déjà en production, healthchecks
sains, sécurité durcie (échappement email, XSS, rate limiting), CI verte
sur du code réel. Aucun P0.

### Commercialisation large (plusieurs dizaines/centaines d'établissements)
**🟡 Prêt sous conditions.** Le code est prêt (pipeline WhatsApp
unifié, sécurité durcie, index manquants comblés, CI fiable). Les
conditions réelles avant d'ouvrir largement :
1. Soumettre et faire approuver les templates WhatsApp Meta (P1 #2) —
   sans ça, aucune notification WhatsApp proactive ne fonctionnera pour
   les nouveaux clients hors fenêtre 24h.
2. Exécuter la checklist de validation Render/Resend/Meta réelle une
   fois, par un opérateur humain (P1 #3) — jamais fait de bout en bout à
   ce jour.
3. Exécuter au moins le palier 100 tenants sur un environnement
   représentatif (P2 #1) avant d'accepter un volume proche de cette
   échelle.

### Déploiement national (1000+ établissements)
**🔴 Pas prêt.** Aucune donnée de charge à cette échelle (P2 #1),
infrastructure cible non provisionnée (voir `docs/runbooks/load-testing.md`,
section dédiée au test à 10 000 utilisateurs — dimensionnement complet
déjà spécifié, jamais mis en œuvre). Décision d'infrastructure et de
budget qui appartient à l'opérateur, hors périmètre de ce qu'une session
de développement peut trancher seule.
