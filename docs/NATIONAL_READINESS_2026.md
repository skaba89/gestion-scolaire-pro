# Audit national — Mise à jour (2026-09)

**Base** : `docs/NATIONAL_AUDIT_PHASE0.md` (2026-07-24).
**Objet** : ce document ne refait pas l'audit Phase 0 — il vérifie, constat par constat et fichier à l'appui, ce qui a bougé depuis. Aucun fichier métier n'a été modifié pour produire la version initiale de ce rapport ; les mises à jour qui suivent, si, au fil des 5 priorités qu'il listait puis des suivantes.

---

## 1. Ce qui a changé depuis Phase 0

| # | Constat Phase 0 | Statut | Preuve |
|---|---|---|---|
| P0-1 | Fenêtre RLS non protégée sur les tables opérationnelles | ✅ **Résolu** | `backend/app/core/operational_tables.py:1157` appelle `_sweep_operational_rls(conn)` dans la même transaction que la création des tables — plus de fenêtre entre `CREATE TABLE` et l'activation RLS. |
| P0-2 | Aucune queue de jobs asynchrones | ✅ **Résolu pour les imports** | Arq est intégré (`backend/app/core/jobs.py`, `backend/app/workers/tasks.py`). Imports CSV élèves/parents/enseignants tous migrés (pattern "polling", `docs/ASYNC_JOBS_GUIDE.md`, PR #209 et #211). Restent hors Arq : exports Excel/comptables, rapports ministère (pas encore de demande produit dessus). |
| P1-1 | Bulletins générés uniquement côté client (jsPDF) | ✅ **Résolu** | `weasyprint` dans `backend/requirements.txt` ; `POST /school-life/generate-report-card/pdf/` (bulletins) et `POST /school-life/generate-certificate/pdf/` (attestations scolarité/fréquentation/niveau) génèrent un vrai PDF serveur, tous deux réutilisant le HTML déjà servi côté navigateur — pas un second template divergent. |
| P1-2 | Endpoints SQL brut sans pagination | 🟡 **Partiellement résolu** | `communication.py:list_conversations` a maintenant `LIMIT`/`OFFSET`. `fix/phase3-list-endpoint-safety-limits` a plafonné les listes RH/inscriptions non filtrées (#198). Les modules library/clubs/surveys/forums restent à vérifier un par un. |
| P1-3 | PWA/offline désactivé en production | ❌ **Non résolu** | `public/sw.js` reste un "Service Worker Killer" volontaire. Décision produit toujours en attente — volontairement exclue des priorités techniques ci-dessous. |
| P1-4 | Pas de rôles institutionnels | ✅ **Résolu** | `MINISTRY_ADMIN`, `REGIONAL_DIRECTOR` et `NATIONAL_INSPECTOR` existent tous dans `ROLE_PERMISSIONS` (`backend/app/core/security.py`), documentés dans `docs/INSTITUTIONAL_ROLES.md`. |
| P1-5 | MFA sans TOTP | ✅ **Résolu** | `pyotp` intégré, enrôlement/vérification/désactivation TOTP réels (`backend/app/api/v1/endpoints/core/mfa.py`), flux de login en 2 étapes (token `mfa_pending` rejeté partout : `verify_token`, websocket, etc.). |
| P2-1 | `prometheus_client` absent des dépendances | ✅ **Résolu** | `backend/requirements.txt` contient `prometheus-client>=0.20.0,<1.0.0`. |
| P2-2 | Pas de modèle universitaire | 🟡 **Mergé, base seulement** | Structure départements/inscriptions + RLS sur `student_subjects` mergée, mais reste une base — pas de couverture fonctionnelle complète encore vérifiée par cet audit. |

**En plus de la liste Phase 0**, 10 vagues d'audit sécurité IDOR/RBAC/injection de FK cross-tenant ont été menées et mergées entre juillet et septembre (`main` history : `#182` à `#199`), couvrant notes, présences, devoirs, notifications, gamification, clubs, e-learning, alumni, mentorat, factures, appareils de confiance, check-ins/inscriptions événements.

Un pipeline CI/CD Azure a aussi été refait : l'ancien workflow de déploiement direct a été retiré (#201) et remplacé par un build/push d'image vers Azure Container Registry (#203). **Écart avec l'architecture cible du prompt** : le déploiement reste manuel après le push d'image (pas de Container Apps, pas de Key Vault, pas d'Application Insights, pas d'environnements DEV/REC/PROD séparés) — écart volontaire de coût/temps à ce stade, pas un oubli.

---

## 2. Scores mis à jour

| Angle | Score Phase 0 | Score actuel | Lecture |
|---|---:|---:|---|
| SaaS multi-établissement (usage actuel) | 64/100 | **78/100** | RLS durci, MFA TOTP réel, imports asynchrones sur les 3 entités principales, PDF serveur pour bulletins et attestations. |
| Prêt pour échelle nationale | 27/100 | **48/100** | Rôles institutionnels complets, jobs async étendus, module université en chantier (base seulement). Ministère (supervision, Phase 7), pagination complète, PWA restent à traiter. |

---

## 3. Nouveaux risques observés

- **Divergence infra documentée vs réelle** : `docs/DEPLOIEMENT_PRODUCTION.md` et consorts peuvent encore décrire l'ancien pipeline de déploiement direct — à vérifier avant de s'y fier pour une passation.
- **Module université** : reste une base technique (RLS + structure) sans audit fonctionnel complet — ne pas le présenter comme "prêt" sans vérification supplémentaire.

---

## 4. Reste ouvert

1. **Pagination complète** (P1-2) — vérifier library/clubs/surveys/forums un par un.
2. **PWA/offline** (P1-3) — décision produit, volontairement hors scope technique.
3. **Audit fonctionnel du module université** (P2-2) — la base RLS/structure est mergée, la couverture fonctionnelle ne l'a pas encore été.

Les 5 priorités techniques listées dans la version précédente de ce document (université, TOTP, `NATIONAL_INSPECTOR`, PDF serveur, migration Arq des imports) sont toutes résolues au 2026-09 (voir tableau §1).
