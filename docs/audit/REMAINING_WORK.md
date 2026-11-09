# Travaux restants — ordre de criticité

Mis à jour le 2026-11-09 (après #498). Une ligne = un défaut ou un manque **constaté** dans le
code, ou une preuve absente. Voir `PROJECT_READINESS.md` pour la matrice.

| # | Priorité | Sujet | Constat | Critère d'acceptation |
|---|---|---|---|---|
| 1 | P1 | Onglet « Analyse des résultats » (page Bulletins) | Calcule encore ses statistiques sur toutes les notes de l'élève (toutes périodes), par nom de matière. Notes désormais chargées seulement à l'ouverture de l'onglet, erreurs visibles. | Statistiques par matière fournies par le serveur pour la période |
| 2 | P2 | Couleurs de moyenne de la page Bulletins | Seuils 10/14 écrits en dur alors que les règles académiques sont réglables par niveau (#496) | Couleurs dérivées des règles effectives |
| 3 | P1 | Comptes de recette par rôle | Seuls admin, enseignant et admin témoin existent en E2E | Seed E2E pour DIRECTOR, SECRETARY, ACCOUNTANT, STUDENT, PARENT, ALUMNI, DEPARTMENT_HEAD + parcours du menu |
| 4 | P1 | Offline | Aucun scénario Playwright de coupure / reprise | Présences saisies hors ligne, synchronisées une seule fois |
| 5 | P2 | Code mort au contrat invalide | `src/queries/reference-data.ts` : `students` (`page_size: 1000`) et `teachers` (`/users/`, `page_size: 500`) dépassent le plafond serveur de 100 (422) ; aucun consommateur | Suppression (validation requise : suppression de code) |
| 6 | P2 | `test_start_sh_db_resolution.py` | 8 échecs en local (Python système 3.14, pas de `python`) ; verts en CI | Test indépendant de l'interpréteur de l'hôte |

Points hors périmètre automatisé, nécessitant une décision humaine : déploiement
en production, recette sur appareils réels, environnement sandbox Mobile Money,
test de charge sur une copie de production.
