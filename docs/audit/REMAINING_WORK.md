# Travaux restants — ordre de criticité

Mis à jour le 2026-11-09 (après #499, recette des portails). Une ligne = un défaut ou un manque **constaté** dans le
code, ou une preuve absente. Voir `PROJECT_READINESS.md` pour la matrice.

| # | Priorité | Sujet | Constat | Critère d'acceptation |
|---|---|---|---|---|
| 1 | P1 | Onglet « Analyse des résultats » (page Bulletins) | Calcule encore ses statistiques sur toutes les notes de l'élève (toutes périodes), par nom de matière. Notes désormais chargées seulement à l'ouverture de l'onglet, erreurs visibles. | Statistiques par matière fournies par le serveur pour la période |
| 2 | P2 | Couleurs de moyenne de la page Bulletins | Seuils 10/14 écrits en dur alors que les règles académiques sont réglables par niveau (#496) | Couleurs dérivées des règles effectives |
| R1 | ~~P0~~ corrigé | Portail parent inutilisable | **Corrigé** (PR fix/parent-portal-invoice-reminders) : réponse paginée lue correctement, impayés PENDING/PARTIAL/OVERDUE, reste à payer affiché. Portail parent parcouru : 8 entrées, 0 défaut | — |
| R6 | P2 | Rappels de devoirs (ReminderSystem) | La requête lit `GET /students/` (paginée, et refusée à l'élève) comme un tableau : les rappels de devoirs restent toujours vides, sans erreur | Source élève/inscription correcte et test |
| R2 | ~~P0~~ corrigé | Tableau de bord étudiant en erreur 500 | **Corrigé** (PR fix/student-dashboard-sql) : jointure classe/niveau sur le schéma réel, statut `ACTIVE`, filtre établissement sur toutes les requêtes, année en cours prioritaire. Portail étudiant parcouru : 7 entrées, 0 défaut | — |
| R3 | ~~P0~~ corrigé | Portail chef de département en erreur 500 | **Corrigé** (PR fix/department-portal-sql) : tableau de bord (`attendance.classroom_id`), classes (`section` inexistante, renvoyée à null), emploi du temps (table `schedule`) ; 6 requêtes comparaient le statut à `active` (élèves et rapports toujours vides) ; activités récentes limitées aux élèves du département (elles listaient les notes de tout l'établissement). Portail parcouru : 11 entrées, 0 défaut | — |
| R4 | ~~P1~~ corrigé | Redirections ALUMNI / SECRETARY | **Corrigé** (PR fix/role-redirects) : règle unique `src/lib/roleRedirect.ts` utilisée par les gardes et par la connexion ; ALUMNI → /alumni, SECRETARY → /admin, chef de département directement sur /department | — |
| R5 | ~~P2~~ traité | « Marketplace Éducatif » sans API | **Retiré** (PR chore/hide-unbuilt-marketplace) : entrée de menu, route, page et requête vers `/library/marketplace/` (inexistante) ; case « Partager sur le Marketplace global » masquée (`is_public` n'était lu nulle part). Un vrai partage entre établissements demanderait un cadrage produit et sécurité (lecture inter-tenant, RLS) | Décision produit avant toute réintroduction |
| 4 | P1 | Offline — scénario coupure / reprise | Aucun scénario Playwright de saisie hors ligne puis reprise réseau | Présences saisies hors ligne, synchronisées une seule fois (lot hors-ligne n°2) |
| O1 | ~~P1~~ corrigé | Données hors ligne après déconnexion | **Corrigé** (PR fix/offline-logout-purge) : toutes les bases IndexedDB vidées (élèves en cache, brouillons, ancienne base) ; envoi tenté avant la déconnexion, pertes annoncées. Parcours E2E 10 : 10 lignes restaient avant correctif, 0 après | — |
| O2 | P1 | Envoi interrompu jamais repris | Action restée `SYNCING` (onglet fermé, coupure) jamais renvoyée | Reprise au démarrage, même clé d'idempotence (lot n°2) |
| O3 | P1 | Plafond de la file | Au-delà de 200 actions, les plus anciennes sont supprimées même non envoyées | Refus visible plutôt que suppression (lot n°2) |
| O4 | P1 | Changement d'établissement | Actions d'un autre établissement supprimées en silence à la synchronisation | Conservées jusqu'au retour, durée bornée (lot n°2) |
| O5 | P2 | Utilisateur non vérifié à l'envoi | La file n'est pas filtrée par utilisateur (couvert par la purge O1) | Défense en profondeur (lot n°2) |
| O6 | P2 | Trois couches hors ligne | `offline/`, `lib/offlineDb.ts`, `lib/db.ts` ; deux chemins de saisie de présence ; le cache d'élèves appelle `/students/?class_id=` (paramètre ignoré : élèves de l'établissement, page 1) | Une seule couche |
| 5 | P2 | Code mort au contrat invalide | `src/queries/reference-data.ts` : `students` (`page_size: 1000`) et `teachers` (`/users/`, `page_size: 500`) dépassent le plafond serveur de 100 (422) ; aucun consommateur | Suppression (validation requise : suppression de code) |
| 6 | P2 | `test_start_sh_db_resolution.py` | 8 échecs en local (Python système 3.14, pas de `python`) ; verts en CI | Test indépendant de l'interpréteur de l'hôte |

Points hors périmètre automatisé, nécessitant une décision humaine : déploiement
en production, recette sur appareils réels, environnement sandbox Mobile Money,
test de charge sur une copie de production.
