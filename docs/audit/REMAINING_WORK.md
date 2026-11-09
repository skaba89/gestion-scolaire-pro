# Travaux restants — ordre de criticité

Mis à jour le 2026-11-09 (après #499, recette des portails). Une ligne = un défaut ou un manque **constaté** dans le
code, ou une preuve absente. Voir `PROJECT_READINESS.md` pour la matrice.

| # | Priorité | Sujet | Constat | Critère d'acceptation |
|---|---|---|---|---|
| 1 | P1 | Onglet « Analyse des résultats » (page Bulletins) | Calcule encore ses statistiques sur toutes les notes de l'élève (toutes périodes), par nom de matière. Notes désormais chargées seulement à l'ouverture de l'onglet, erreurs visibles. | Statistiques par matière fournies par le serveur pour la période |
| 2 | P2 | Couleurs de moyenne de la page Bulletins | Seuils 10/14 écrits en dur alors que les règles académiques sont réglables par niveau (#496) | Couleurs dérivées des règles effectives |
| R1 | **P0** | Portail parent inutilisable | Tout le portail plante (« invoiceData.forEach is not a function ») pour un parent ayant un enfant : `ReminderSystem.tsx` traite la réponse paginée de `GET /invoices/` comme un tableau ; filtres `student_id__in`/`status__in` ignorés par l'API | Portail parent parcouru sans défaut (retirer l'entrée de la référence) ; test Vitest |
| R2 | **P0** | Tableau de bord étudiant en erreur 500 | `GET /students/dashboard/` : `column e.level_id does not exist` (PostgreSQL) — `students.py::get_student_dashboard` joint `levels` sur `enrollments` | 200 sur PostgreSQL, test de régression PG |
| R3 | **P0** | Portail chef de département en erreur 500 | `department-portal` : `dashboard` (colonne `class_id` inexistante), `classrooms` (`c.section` inexistante), `schedule` (table `schedules` inexistante) | 3 routes en 200 sur PostgreSQL, tests PG |
| R4 | P1 | Redirections ALUMNI / SECRETARY | `getRedirectPathForRoles` (`ProtectedRoute.tsx`) ignore ces rôles : renvoi vers `/` (page publique) au lieu de leur portail ; reproduit en Vitest et en E2E | Test Vitest + entrée « foreign » retirée de la référence |
| R5 | P2 | Bibliothèque : route inexistante | `src/queries/admin.ts` appelle `GET /library/marketplace/` (404, admin et direction) | Route réelle ou appel retiré |
| 4 | P1 | Offline | Aucun scénario Playwright de coupure / reprise | Présences saisies hors ligne, synchronisées une seule fois |
| 5 | P2 | Code mort au contrat invalide | `src/queries/reference-data.ts` : `students` (`page_size: 1000`) et `teachers` (`/users/`, `page_size: 500`) dépassent le plafond serveur de 100 (422) ; aucun consommateur | Suppression (validation requise : suppression de code) |
| 6 | P2 | `test_start_sh_db_resolution.py` | 8 échecs en local (Python système 3.14, pas de `python`) ; verts en CI | Test indépendant de l'interpréteur de l'hôte |

Points hors périmètre automatisé, nécessitant une décision humaine : déploiement
en production, recette sur appareils réels, environnement sandbox Mobile Money,
test de charge sur une copie de production.
