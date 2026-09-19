# Audit national — Mise à jour (2026-09)

**Base** : `docs/NATIONAL_AUDIT_PHASE0.md` (2026-07-24), mis à jour une première fois à `7cb4db9`.
**Objet** : deuxième passe — vérifie, constat par constat et fichier à l'appui, l'effet des 5 PR lancées depuis la première mise à jour de ce document, plus un audit de pagination (aucune PR, recherche seule). Sur `main` après merge de #204 (module université), #206 (TOTP), #207 (NATIONAL_INSPECTOR), #208 (PDF bulletins), #209 (import CSV asynchrone).

---

## 1. Ce qui a changé depuis la dernière mise à jour

| # | Constat | Statut | Preuve |
|---|---|---|---|
| P0-1 | Fenêtre RLS non protégée | ✅ **Résolu** (inchangé) | Voir mise à jour précédente. |
| P0-2 | Aucune queue de jobs asynchrones | 🟡 **En cours, avancé** | Import CSV élèves (`confirm_student_import`) migré vers Arq avec repli synchrone (#209) — premier exemple du pattern "polling" (`GET /import/jobs/{id}/`), documenté dans `docs/ASYNC_JOBS_GUIDE.md`. Imports parents/enseignants et génération de bulletins en masse (`generate-report-cards/batch/`) restent synchrones. |
| P1-1 | Bulletins générés uniquement côté client (jsPDF) | ✅ **Résolu** | `POST /school-life/generate-report-card/pdf/` (#208) rend un vrai fichier PDF via WeasyPrint, réutilisant exactement les mêmes données/autorisations que l'endpoint HTML existant (`generate-report-card/v2/`, qui reste aussi disponible). Limité aux bulletins — les ~10 autres générateurs jsPDF côté client (factures, fiches de paie, contrats, listes de classe, tableaux de bord) sont inchangés. |
| P1-2 | Endpoints SQL brut sans pagination | ✅ **Résolu** | Audit module par module (library/clubs/surveys/communication/aliases-forums) : `library.py`/`clubs.py`/`surveys.py` sont déjà entièrement en ORM (pas de SQL brut, donc hors périmètre de ce risque). Dans `communication.py`, tous les endpoints à volume réel (`get_announcements`, `get_messaging_users`, `list_conversations`, `list_forums`) ont déjà `page`/`page_size` + `LIMIT/OFFSET` ; `poll_new_messages` a un `LIMIT 50` fixe. Seul `list_message_reactions` (ligne 741) n'a aucune limite, mais elle est scopée à un seul `message_id` (réactions par message = quelques lignes, jamais à l'échelle du tenant) — pas un vecteur de risque réel, volontairement non modifié. `aliases.py` : `list_course_discussions` a déjà `limit: int = Query(10, le=100)`. |
| P1-3 | PWA/offline désactivé en production | ❌ **Non résolu** | Décision produit, volontairement hors périmètre de ce cycle. |
| P1-4 | Pas de rôles institutionnels | ✅ **Résolu** | `NATIONAL_INSPECTOR` ajouté (#207) — même forme que `MINISTRY_ADMIN` (plateforme, `ministry:read`, MFA obligatoire, révocation fail-closed, visibilité nationale complète non narrowée dans `ministry.py`). Les 3 rôles de la hiérarchie institutionnelle prévue par le prompt d'audit (`MINISTRY_ADMIN`, `NATIONAL_INSPECTOR`, `REGIONAL_DIRECTOR`/`PREFECTURE_ADMIN`/`COMMUNE_ADMIN`) existent maintenant. Reste hors périmètre : `UNIVERSITY_RECTOR`, `SUPER_ADMIN_PLATFORM` dédié. |
| P1-5 | MFA sans TOTP | ✅ **Résolu** | TOTP réel ajouté (#206, `pyotp`) — enrôlement/vérification/désactivation. **Découverte en cours de route, plus grave que le manque de TOTP** : avant #206, `mfa_enabled=True` suffisait à obtenir un token pleinement valide au login sans jamais vérifier de second facteur côté serveur — corrigé (`verify_token()`/`verify_token_raw()` rejettent désormais un jeton `mfa_pending`, sans quoi le nouveau verrou lui-même aurait été contournable). |
| P2-1 | `prometheus_client` absent des dépendances | ✅ **Résolu** (inchangé) | — |
| P2-2 | Pas de modèle universitaire | 🟡 **En cours, mergé** | #204 mergée : structure départements/inscriptions + `student_subjects` avec RLS actif dès la migration. Base posée, pas le modèle universitaire complet (facultés, UE, crédits, semestres — toujours Phase 8). |

**Nouveau depuis cette passe** : `docs/INSTITUTIONAL_ROLES.md` et `docs/ASYNC_JOBS_GUIDE.md` mis à jour dans les mêmes commits que les changements de code qu'ils documentent (pas après coup) — précisément pour éviter la classe de bug que `INSTITUTIONAL_ROLES.md` documentait lui-même (un rôle "oublié" dans la doc a causé un vrai trou MFA pour `MINISTRY_ADMIN`/`REGIONAL_DIRECTOR` par le passé).

---

## 2. Scores mis à jour

| Angle | Score initial (juillet) | Score précédent | Score actuel | Lecture |
|---|---:|---:|---:|---|
| SaaS multi-établissement (usage actuel) | 64/100 | 72/100 | **78/100** | MFA réellement appliqué au login (pas seulement côté client), PDF serveur pour les documents officiels, pagination SQL brut confirmée partout où le volume le justifie. |
| Prêt pour échelle nationale | 27/100 | 35/100 | **45/100** | Hiérarchie institutionnelle MFA-protégée complète (Ministère/Inspecteur/Région/Préfecture/Commune), premier pattern d'import asynchrone posé et documenté. Module université mergé. PWA reste la seule décision non technique en attente. |

---

## 3. Ce qui reste ouvert

- **P1-3** — décision produit PWA/offline, toujours en attente, hors périmètre technique.
- **P0-2 (reste)** — imports CSV parents/enseignants et génération de bulletins en masse toujours synchrones ; le pattern posé par #209 est réutilisable directement.
- **Modules jsPDF client-only restants** (P1-1, hors bulletins) — factures, fiches de paie, contrats, listes de classe, tableaux de bord : même limite qu'avant (documents non archivables côté serveur), volontairement non traités.
- Note en passant (hors périmètre P1-2) : `list_categories` (library.py) et `list_clubs` (clubs.py) appellent leurs fonctions CRUD ORM sans argument de pagination — à vérifier si ces fonctions CRUD plafonnent déjà les résultats en interne, question de couche ORM distincte du risque SQL-brut clos ici.

---

## 4. Priorités proposées pour le prochain cycle (rien n'est encore lancé)

1. **Étendre le pattern d'import asynchrone** (#209) aux imports parents/enseignants — même code partagé (`app/services/*_import.py`), risque faible, réutilise l'infrastructure déjà posée et testée.
2. **Génération PDF serveur pour un deuxième document officiel** (ex. attestation de scolarité, relevé de notes) — réutilise directement le pattern WeasyPrint posé par #208.
3. **Décision produit PWA/offline** (P1-3) — nécessite un arbitrage humain, pas un correctif technique ; à remonter séparément plutôt qu'à traiter en PR.

Aucune de ces 3 pistes n'a été lancée. Confirmez laquelle démarrer en premier, ou une autre priorité.
