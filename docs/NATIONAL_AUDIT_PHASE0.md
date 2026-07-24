# Audit national — Phase 0

**Date** : 2026-07-24
**Portée** : évaluer SchoolFlow Pro / gestion-scolaire-pro pour une transformation vers une plateforme nationale (1000+ établissements, Guinée/Afrique francophone).
**Méthode** : inspection directe du code (backend + frontend + CI/CD + infra), pas d'estimation — chaque constat ci-dessous est sourcé par un chemin de fichier.

---

## 1. Scores

| Angle | Score | Lecture |
|---|---:|---|
| **SaaS multi-établissement (usage actuel)** | **64/100** | Solide pour gérer des dizaines/centaines d'établissements indépendants. Fondations tenant/RLS/JWT/CI réelles, pas de façade. |
| **Prêt pour échelle nationale (1000+, ministère, université)** | **27/100** | Les briques spécifiquement "nationales" (hiérarchie institutionnelle, supervision ministère, jobs asynchrones, mode université, PWA/offline actif) sont soit absentes soit désactivées. |

Le score bas sur l'axe national n'est pas une critique du travail existant : les phases 7 (ministère), 8 (université) et 17 (industrialisation) demandées n'ont simplement pas encore commencé. C'est attendu à ce stade.

---

## 2. Risques classés

### P0 — Bloquants avant toute mise à l'échelle

**P0-1 — Fenêtre RLS non protégée sur ~64 tables "opérationnelles"**
`backend/app/core/operational_tables.py` crée au démarrage (`CREATE TABLE IF NOT EXISTS`), **après** `alembic upgrade head`, ~64 tables tenant-scoped sans modèle SQLAlchemy (library, clubs, surveys, forums, messaging, alumni, invoices, homework, exams, incidents, achievements, e-learning…). Le RLS n'est activé sur ces tables que par des migrations Alembic à balayage dynamique postérieures (`enforce_rls_on_all_tables`, `enforce_rls_on_current_tenant_tables`, `enforce_rls_remaining_tables`). Sur un déploiement neuf, il existe une fenêtre où ces tables existent sans policy RLS active.
*Impact* : fuite cross-tenant potentielle sur des données sensibles (messages, incidents, alumni) si une requête passe entre la création de la table et la prochaine migration de balayage.
*Effort correctif* : moyen — ajouter un balayage RLS systématique exécuté juste après la création de `operational_tables.py` (pas seulement via migration Alembic ponctuelle), avec un test qui échoue si une table tenant-scoped n'a pas de policy.

**P0-2 — Aucune queue de jobs asynchrones**
Grep `celery|rq|arq` sur tout `backend/` = zéro résultat. Seul `BackgroundTasks` FastAPI (in-process, perdu au redémarrage, non observable) est utilisé (3 fichiers).
*Impact* : génération de bulletins en masse, imports Excel de milliers d'élèves, envoi SMS/email, exports comptables — tout cela bloquerait une requête HTTP ou serait perdu au redémarrage du conteneur. Non viable à 1000 établissements (Phase 5, 11, 17 explicitement dépendantes de ceci).
*Effort correctif* : élevé — introduire Redis-backed queue (Arq, déjà compatible avec Redis existant) + table `jobs` + statut/retry.

### P1 — Sécurité/qualité à corriger avant bêta commerciale élargie

**P1-1 — Bulletins générés uniquement côté client (jsPDF)**
`src/utils/pdfGenerator.ts` — aucune génération PDF côté serveur (pas de `reportlab`/`weasyprint` dans `backend/requirements.txt`). Un document officiel (bulletin, relevé de notes, attestation) généré uniquement dans le navigateur n'est pas auditable, ne peut pas être archivé de façon fiable côté serveur, et ne peut pas être généré en masse pour tout un établissement.

**P1-2 — Endpoints en SQL brut sans pagination**
`backend/app/api/v1/endpoints/operational/communication.py:194` (`list_conversations`) et probablement les modules similaires en SQL brut (library, clubs, surveys, forums, alumni — mêmes conventions de code, non vérifiés un par un) n'ont pas de `LIMIT`/`OFFSET`. Risque de charge mémoire/latence incontrôlée à mesure que les tenants grossissent.

**P1-3 — PWA/offline désactivé en production**
`public/sw.js` est un "Service Worker Killer" volontaire (désinstalle tout SW existant), activé pour éviter des soucis de cold-start observés en prod. Aucun `manifest.json`. Le code offline (`src/lib/offlineDb.ts`, `useOfflineSync.ts`, `OfflineAttendance.tsx`) existe et est bien conçu mais n'est pas exploitable sans SW actif. Cela contredit directement l'objectif "faible connexion / usage mobile massif" — nécessite une décision produit (réactiver un SW fiabilisé, pas juste un fix technique).

**P1-4 — Pas de rôles institutionnels**
`ROLE_PERMISSIONS` (`backend/app/core/security.py:272-379`) ne connaît que 11 rôles orientés établissement unique. Aucun `MINISTRY_ADMIN`/`REGIONAL_DIRECTOR`/`NATIONAL_INSPECTOR`. Attendu — objet de la Phase 2, pas un bug.

**P1-5 — MFA sans TOTP**
`backend/app/api/v1/endpoints/core/mfa.py` : codes de secours + OTP email, mais pas de TOTP (Google Authenticator). Acceptable pour un SaaS établissement, insuffisant pour des comptes ministère/région à fort enjeu (Phase 14).

### P2 — Dette technique, non bloquante

- **P2-1** — Métriques Prometheus câblées dans le code (`backend/app/middlewares/metrics.py`) mais `prometheus_client` absent de `backend/requirements.txt` → dégradation silencieuse, métriques inactives. *Correctif trivial : ajouter la dépendance.*
- **P2-2** — Pas de modèle universitaire (facultés, filières, UE, crédits, semestres) — attendu, Phase 8.
- **P2-3** — Budget ESLint (2179, cible 1500) et couverture backend (43%, cible 45%) déjà en réduction progressive documentée (Phase 12/13 en cours, pas au point mort).
- **P2-4** — `crud/` ne couvre que 6 modules sur ~40 endpoints — le reste écrit du SQL brut directement dans les endpoints. Pas dangereux en soi (paramétré, pas d'injection détectée) mais rend l'ajout systématique de pagination/RLS/tests plus lent.

---

## 3. Ce qui est déjà solide (ne pas casser, ne pas refaire)

- **Isolation tenant** : `TenantMixin`, `TenantContext.tsx`, résolution par slug + header `X-Tenant-ID` réservé au super-admin — architecture correcte.
- **JWT** : versioning de token, blacklist Redis vérifiée sur toutes les routes authentifiées, limite de sessions actives dès le login (durci cette semaine).
- **CI/CD** : 5 jobs, dont un test réel de backup/restore PostgreSQL en CI (rare), scan de secrets, `npm audit`, `pip-audit`, garde-fou anti-multi-head Alembic.
- **Paiements Afrique francophone** : `CinetPayGateway` (couvre la Guinée) + `PayTechGateway` (Wave, Orange Money, MTN), webhooks signés HMAC — déjà pensé pour le marché cible, pas à refaire.
- **Rate limiting / lockout** : `slowapi` sur les routes sensibles (5/min login, 3/min reset password), lockout de compte actif.
- **Backup/restore** : scripts + service systemd + testé automatiquement en CI à chaque run — point fort rare dans un SaaS de cette taille.

---

## 4. Quick wins (< 1 jour chacun, faible risque)

1. Ajouter `prometheus_client` à `backend/requirements.txt` → réactive les métriques déjà codées (P2-1).
2. Ajouter `LIMIT`/`OFFSET` à `list_conversations` et auditer systématiquement les endpoints SQL brut restants (P1-2, partiel rapide).
3. Ajouter un test CI qui échoue si une table avec colonne `tenant_id` n'a pas de policy RLS active (détecte la classe de bug P0-1 sans encore la corriger structurellement).

---

## 5. Plan de correction par phase (proposition de séquencement)

Le prompt fourni définit 18 phases. Vu leur volume (chacune représente plusieurs jours à semaines de travail réel, avec tests et documentation dédiés), je recommande de les traiter **une par une, dans des sessions séparées**, conformément à la règle que vous avez vous-même posée ("travailler par phases", "chaque phase doit être testable"). Faire les 18 phases dans une seule réponse produirait soit un travail superficiel non testé, soit des affirmations non vérifiées — ce que les règles absolues interdisent explicitement ("ne pas masquer les erreurs dans le rapport").

Séquencement recommandé, basé sur les risques ci-dessus :

| Ordre | Phase | Justification |
|---|---|---|
| 1 | **Phase 1** — Verrou sécurité | P0-1 et P1-5 en font partie ; le prompt la place aussi en premier. |
| 2 | **Phase 3** — Scalabilité DB (pagination, index) | Corrige P1-2 directement, prérequis avant d'ouvrir à plus de tenants. |
| 3 | **Phase 5** — Workers asynchrones | Corrige P0-2, bloquant structurel pour tout le reste (bulletins, imports, ministère). |
| 4 | **Phase 6** — Observabilité | Corrige P2-1, prérequis pour opérer 1000 tenants sans visibilité. |
| 5 | **Phase 2** — Modèle national multi-niveaux | Base pour Phase 7. |
| 6 | **Phase 7** — Module ministère | Dépend de Phase 2. |
| 7 | **Phase 8** — Mode université | Indépendant, peut être parallélisé si prioritaire commercialement. |
| 8+ | Phases 9-17 | Séquencées selon retour terrain (Phase 16 pilote) plutôt qu'à l'avance. |

---

## 6. Recommandation

**Ne pas lancer les 18 phases maintenant.** Confirmez laquelle démarrer en premier (la Phase 1 sécurité est recommandée, car elle contient les deux risques P0) et je la traite dans une session dédiée, avec tests et rapport de résultats — pas une estimation.
