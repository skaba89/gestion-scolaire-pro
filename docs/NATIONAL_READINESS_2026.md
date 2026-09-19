# Audit national — Mise à jour (2026-09)

**Base** : `docs/NATIONAL_AUDIT_PHASE0.md` (2026-07-24).
**Objet** : ce document ne refait pas l'audit Phase 0 — il vérifie, constat par constat et fichier à l'appui, ce qui a bougé depuis, sur `main` à `7cb4db9`. Aucun fichier métier n'a été modifié pour produire ce rapport.

---

## 1. Ce qui a changé depuis Phase 0

| # | Constat Phase 0 | Statut | Preuve |
|---|---|---|---|
| P0-1 | Fenêtre RLS non protégée sur les tables opérationnelles | ✅ **Résolu** | `backend/app/core/operational_tables.py:1157` appelle `_sweep_operational_rls(conn)` dans la même transaction que la création des tables — plus de fenêtre entre `CREATE TABLE` et l'activation RLS. Le commentaire ligne 967 le confirme explicitement. |
| P0-2 | Aucune queue de jobs asynchrones | 🟡 **En cours** | Arq est intégré (`backend/app/core/jobs.py`, `backend/app/workers/tasks.py`) et utilisé dans `finance/payments.py`, `operational/admissions.py`, `aliases.py`. 3 tâches migrées à ce jour : email de bienvenue, rappels de paiement (push/email), reset mot de passe (`c8b3f32`, Phase 5). Le gros des `BackgroundTasks` FastAPI restants (bulletins en masse, imports Excel, exports comptables) n'est pas encore migré. |
| P1-1 | Bulletins générés uniquement côté client (jsPDF) | ❌ **Non résolu** | Toujours aucun `weasyprint`/`reportlab` dans `backend/requirements.txt`. |
| P1-2 | Endpoints SQL brut sans pagination | 🟡 **Partiellement résolu** | `communication.py:list_conversations` a maintenant `LIMIT`/`OFFSET` (ligne 60, 167). `fix/phase3-list-endpoint-safety-limits` a plafonné les listes RH/inscriptions non filtrées (`a48316b`, #198). Les modules library/clubs/surveys/forums restent à vérifier un par un. |
| P1-3 | PWA/offline désactivé en production | ❌ **Non résolu** | `public/sw.js` reste un "Service Worker Killer" volontaire. Décision produit toujours en attente. |
| P1-4 | Pas de rôles institutionnels | ✅ **Résolu (partiel)** | `MINISTRY_ADMIN` et `REGIONAL_DIRECTOR` existent maintenant dans `ROLE_PERMISSIONS` (`backend/app/core/security.py:138-139, 615-622`). `NATIONAL_INSPECTOR` n'existe toujours pas. |
| P1-5 | MFA sans TOTP | ❌ **Non résolu** | Aucune trace de `totp`/`pyotp` dans `backend/app`. |
| P2-1 | `prometheus_client` absent des dépendances | ✅ **Résolu** | `backend/requirements.txt` contient `prometheus-client>=0.20.0,<1.0.0`, avec commentaire de contexte sur le bug corrigé. |
| P2-2 | Pas de modèle universitaire | 🟡 **En cours, non mergé** | Branche `feat/university-departments-course-registration` (2 commits : structure départements/inscriptions + activation RLS sur `student_subjects`) — pas encore fusionnée dans `main`. |

**En plus de la liste Phase 0**, 10 vagues d'audit sécurité IDOR/RBAC/injection de FK cross-tenant ont été menées et mergées entre juillet et septembre (`main` history : `#182` à `#199`), couvrant notes, présences, devoirs, notifications, gamification, clubs, e-learning, alumni, mentorat, factures, appareils de confiance, check-ins/inscriptions événements. C'est un volume de correctifs de sécurité largement supérieur à ce que Phase 0 anticipait — signe que l'audit initial a été suivi sérieusement, pas juste documenté.

Un pipeline CI/CD Azure a aussi été refait : l'ancien workflow de déploiement direct (`main_api-schoolflow-prod-001.yml`) a été retiré (`ddbb195`, #201) et remplacé par un build/push d'image vers Azure Container Registry (`build-push-acr.yml`, #203). **Écart avec l'architecture cible du prompt** : le déploiement reste manuel après le push d'image (pas de Container Apps, pas de Key Vault, pas d'Application Insights, pas d'environnements DEV/REC/PROD séparés) — écart volontaire de coût/temps à ce stade, pas un oubli.

---

## 2. Scores mis à jour

| Angle | Score Phase 0 | Score actuel | Lecture |
|---|---:|---:|---|
| SaaS multi-établissement (usage actuel) | 64/100 | **72/100** | RLS durci, pagination partielle, 10 vagues de correctifs IDOR/RBAC mergées. |
| Prêt pour échelle nationale | 27/100 | **35/100** | Rôles institutionnels amorcés, jobs async démarrés, module université en chantier. Ministère (supervision, Phase 7), PDF serveur, PWA et TOTP restent à traiter. |

---

## 3. Nouveaux risques observés

- **Divergence infra documentée vs réelle** : `docs/DEPLOIEMENT_PRODUCTION.md` et consorts peuvent encore décrire l'ancien pipeline de déploiement direct — à vérifier avant de s'y fier pour une passation.
- **Travail non mergé en attente** : `feat/university-departments-course-registration` contient une activation RLS (`student_subjects`) qui est elle-même un correctif de sécurité — la laisser non mergée prolonge une exposition évitable si le module est déjà utilisé quelque part.

---

## 4. Priorités proposées (à valider avant lancement — rien n'est encore commencé)

1. **Fusionner `feat/university-departments-course-registration`** — contient un correctif RLS, pas seulement une feature ; le laisser en attente est un risque de sécurité gratuit.
2. **TOTP pour les comptes ministère/région** (P1-5) — seul risque P1 de Phase 0 qui touche directement les rôles institutionnels déjà en place (`MINISTRY_ADMIN`, `REGIONAL_DIRECTOR`), donc exploitable dès maintenant si un incident survient.
3. **Ajouter `NATIONAL_INSPECTOR`** au modèle de rôles — complète P1-4, cohérence avec la hiérarchie institutionnelle déjà partiellement câblée.
4. **Génération PDF côté serveur** (P1-1) pour les bulletins/attestations — bloquant pour tout export en masse via la queue Arq déjà en place (Phase 5 ne peut pas migrer "génération de bulletins en masse" tant que le PDF reste client-only).
5. **Terminer la migration des `BackgroundTasks` restants vers Arq** (bulletins en masse, imports Excel) — complète P0-2, qui est le risque bloquant structurel le plus large encore ouvert.

Décision PWA/offline (P1-3) volontairement exclue de cette liste : c'est un choix produit, pas un correctif technique — à trancher séparément.

Aucune de ces 5 PR n'a été lancée. Confirmez laquelle démarrer en premier.
