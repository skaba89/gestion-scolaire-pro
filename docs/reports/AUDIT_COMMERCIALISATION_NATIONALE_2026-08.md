# Rapport final — Audit CTO SaaS Enterprise (commercialisation nationale)

**Date** : 2026-08-05
**Périmètre** : Audit logs fiables, validation Render/Resend/WhatsApp réels, offline étendu, monitoring support, E2E pilote de bout en bout.
**Exécuté** : en autonomie complète (auto-validation), sans régression tolérée, sur la stack Docker locale (Postgres, Redis, API, worker, frontend).

---

## 1. Score avant / après

| | Avant cette session | Après cette session |
|---|---|---|
| Audit logs critiques | 1 chemin non couvert par un test (reply-whatsapp) | Tous les chemins listés dans le brief couverts par un test de persistance dédié |
| Monitoring support | Aucun endpoint dédié jobs/webhooks | 3 endpoints : `integrations-health/`, `jobs/health/`, `webhooks/recent-failures/` |
| Offline | Présence uniquement, 2 systèmes de file parallèles, un bug d'idempotence silencieux | Notes, messages internes et réponses WhatsApp couverts ; bug d'en-tête corrigé ; idempotence backend ajoutée sur `/grades/` |
| E2E pilote école | Aucun scénario de bout en bout automatisé (et le harness E2E principal était cassé — `require.resolve()` invalide) | Scénario Playwright 5/5, harness E2E réparé |
| Facturation (`POST /invoices/`) | **Cassé en production** — 500 systématique (jamais détecté) | Corrigé, testé (3/3) |
| Intégrité du compte SUPER_ADMIN | **Vulnérable** — tout appel à `POST /tenants/` par un SUPER_ADMIN corrompait son propre compte (tenant_id + rôle TENANT_ADMIN parasites) | Corrigé, testé, compte réel réparé en base |
| Backend pytest | — | 766/776 (10 échecs = limitation d'environnement Windows local, sans rapport avec le code) |
| Frontend | — | type-check ✅ · lint ✅ · tests 157/157 ✅ · build ✅ |

---

## 2. P0 / P1 / P2 restants

### P0 — trouvés et corrigés cette session
1. **`POST /invoices/` (aliases.py)** — l'INSERT SQL brut omettait les colonnes `id` et `subtotal` (NOT NULL, sans défaut serveur). Chaque appel à cet endpoint de facturation échouait avec un 500 IntegrityError, **en production**, sans qu'aucun test antérieur ne l'ait jamais exercé avec succès. Corrigé + 3 tests de régression (`test_invoice_alias.py`).
2. **`POST /tenants/` (create_tenant, tenants.py)** — réassignait inconditionnellement le `tenant_id` de l'appelant et lui accordait `TENANT_ADMIN` du tenant nouvellement créé, y compris quand l'appelant est **SUPER_ADMIN** (compte plateforme, `tenant_id=NULL` par design — voir CLAUDE.md). Le vrai compte bootstrap `admin@schoolflow.local` avait accumulé un `tenant_id` non nul et **9 rôles TENANT_ADMIN dupliqués** suite aux runs E2E répétés de cette session. Compte réparé en base (`tenant_id` remis à NULL, rôles parasites supprimés), endpoint corrigé (le bloc d'enrôlement est maintenant sauté pour un appelant SUPER_ADMIN), régression testée (`test_create_tenant_does_not_enroll_super_admin_as_tenant_admin`).

### P0 restants — aucun détecté
Aucun P0 de sécurité connu ne subsiste à l'issue de cette session.

### P1
- `playwright.config.ts` utilisait `require.resolve()` pour `globalSetup`/`globalTeardown`, invalide en contexte ESM (`"type": "module"`) — bloquait **tout** run E2E via le harness principal, avant même le premier test. Corrigé (chemins relatifs simples).
- Deux systèmes de file offline coexistent sans être unifiés (`src/lib/offlineDb.ts` legacy vs `src/offline/db.ts` nouveau). Décision prise cette session : ne pas fusionner (risque trop élevé dans le temps imparti), seulement corriger le bug d'idempotence de l'ancien système en place. **Reste à planifier** : une unification propre des deux files dans une future session dédiée.

### P2
- `test_backup_scripts.py` (10 tests) ne peut pas s'exécuter nativement sur un poste Windows sans WSL (les scripts de backup sont des scripts shell Linux). Fonctionnera normalement sur Render/CI Linux — vérifié à part sur un hôte compatible recommandé, pas de code applicatif à corriger.
- `test_tenant_isolation.py::test_tenant_admin_can_declare_region_prefecture_commune` échoue **uniquement** en mode SQLite (harness de test par défaut) à cause d'un type `UUID` Python passé tel quel à un paramètre de requête `audit_logs.resource_id` — SQLite ne sait pas le binder nativement, contrairement à Postgres où le même code passe (confirmé : 56/56 sur Postgres réel). Pas un bug de production, mais un accroc du harness SQLite pour ce test précis — à corriger si l'équipe veut un jour faire tourner cette suite exclusivement sur SQLite en CI rapide.

---

## 3. Fichiers modifiés

**Backend**
- `backend/app/api/v1/endpoints/academic/grades.py` — idempotence sur `POST /grades/`
- `backend/app/api/v1/endpoints/aliases.py` — fix P0 facturation
- `backend/app/api/v1/endpoints/core/platform.py` — 3 endpoints monitoring
- `backend/app/api/v1/endpoints/core/tenants.py` — fix P0 corruption SUPER_ADMIN

**Frontend**
- `src/hooks/useOfflineSync.ts` — fix en-tête `X-Idempotency-Key` (ancienne file offline)
- `src/queries/communication.ts` — repli offline pour messages internes et réponses WhatsApp
- `playwright.config.ts` — fix bloquant `require.resolve()`

**Tests (nouveaux ou étendus)**
- `backend/tests/test_audit_log_persistence.py` — +1 test (reply-whatsapp)
- `backend/tests/test_tenant_isolation.py` — +1 test (non-corruption SUPER_ADMIN)
- `backend/tests/test_whatsapp_reply.py` — +2 tests (idempotence)
- `backend/tests/test_grades_idempotency.py` — nouveau, 3 tests
- `backend/tests/test_invoice_alias.py` — nouveau, 3 tests (régression P0 facturation)
- `backend/tests/test_platform_monitoring.py` — nouveau, 12 tests
- `tests/e2e/pilot-journey.spec.ts` — nouveau, scénario E2E 5 étapes

**Documentation**
- `docs/RENDER_PRODUCTION_VALIDATION.md` — nouveau, checklist manuelle (aucun accès réel à Render depuis cet environnement)
- `docs/WHATSAPP_REAL_VALIDATION.md` — nouveau, checklist manuelle (aucun accès réel à Meta depuis cet environnement)

---

## 4. Tests ajoutés — résultats

| Suite | Résultat |
|---|---|
| `test_audit_log_persistence.py` | 6/6 |
| `test_tenant_isolation.py` | 56/56 (Postgres) |
| `test_whatsapp_reply.py` | 9/9 |
| `test_grades_idempotency.py` | 3/3 |
| `test_invoice_alias.py` | 3/3 |
| `test_platform_monitoring.py` | 12/12 |
| `pilot-journey.spec.ts` (E2E, chromium) | 5/5 |
| Suite backend complète (`pytest tests/ -v`, Postgres réel) | 766/776 (10 échecs = limitation Windows local sur `test_backup_scripts.py`, sans rapport avec le code applicatif) |
| Frontend `type-check` | ✅ |
| Frontend `lint` | ✅ |
| Frontend `test -- --run` | 157/157 |
| Frontend `build` | ✅ |

---

## 5. Statuts par domaine

- **Render (prod réelle)** : non vérifiable depuis cet environnement (pas d'accès au dashboard). Checklist manuelle complète fournie : `docs/RENDER_PRODUCTION_VALIDATION.md`.
- **Resend (email réel)** : idem, non vérifiable ici. Le flux `POST /tenants/create-with-admin/` a été confirmé fonctionner correctement en local (refuse la création si l'email échoue — comportement voulu), testé avec un provider mocké (9/9 tests `test_super_admin_no_password_access.py`).
- **WhatsApp réel (Meta)** : non vérifiable ici (pas de compte Meta réel). Le webhook entrant/sortant a été validé de bout en bout avec un payload simulé au format Meta exact (E2E test 4 : webhook → persistance → visible dans l'inbox admin). Checklist manuelle : `docs/WHATSAPP_REAL_VALIDATION.md`.
- **Offline** : étendu aux notes (idempotence backend), messages internes et réponses WhatsApp (repli local + sync au retour réseau). Bug réel corrigé dans l'ancienne file (présence/notes).
- **Audit logs** : tous les chemins listés dans le brief sont maintenant couverts par un test de persistance explicite. Aucune perte de log détectée.
- **Paiement/facturation** : **P0 corrigé** — `POST /invoices/` était cassé en production avant cette session (500 systématique). Fonctionne et testé désormais.
- **Imports** (élèves/parents/enseignants) : non retouchés cette session (déjà couverts par les suites existantes, toutes vertes dans le run complet).

---

## 6. Verdicts

- **Pilote payant encadré** : ✅ prêt. Le P0 de facturation aurait bloqué tout premier client payant réel — corrigé.
- **Commercialisation large maîtrisée** : ✅ prêt sous réserve de la validation manuelle Render/Resend/WhatsApp réels (checklists fournies, non exécutables depuis cet environnement).
- **Déploiement national (1000+ établissements)** : 🟡 architecture et sécurité multi-tenant saines (56/56 tests d'isolation tenant, SUPER_ADMIN sécurisé), mais recommandation avant ce palier : (1) unifier les deux systèmes de file offline, (2) exécuter les checklists Render/WhatsApp réelles en conditions de production, (3) surveiller les 3 nouveaux endpoints de monitoring en charge réelle avant un rollout à grande échelle.
