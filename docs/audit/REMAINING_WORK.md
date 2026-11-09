# Travaux restants — ordre de criticité

Mis à jour le 2026-11-09. Une ligne = un défaut ou un manque **constaté** dans le
code, ou une preuve absente. Voir `PROJECT_READINESS.md` pour la matrice.

| # | Priorité | Sujet | Constat | Critère d'acceptation |
|---|---|---|---|---|
| 1 | P1 | « Moy. estimée » de la page admin Bulletins | Calculée dans le navigateur sur **toutes** les notes de l'élève (toutes périodes et années), regroupées par nom de matière, note absente comptée 0. Peut différer de la moyenne du PDF, calculée côté serveur pour la période. `GET /grades/` n'a pas de filtre de période. | La valeur affichée provient du même calcul serveur que le PDF, pour la période choisie ; test E2E comparant affichage et PDF |
| 2 | P1 | Contenu du PDF de bulletin | L'E2E vérifie seulement l'en-tête `%PDF-` | Extraction du texte du PDF et comparaison avec moyenne/rang renvoyés par l'API |
| 3 | P1 | Comptes de recette par rôle | Seuls admin, enseignant et admin témoin existent en E2E | Seed E2E pour DIRECTOR, SECRETARY, ACCOUNTANT, STUDENT, PARENT, ALUMNI, DEPARTMENT_HEAD + parcours du menu |
| 4 | P1 | Offline | Aucun scénario Playwright de coupure / reprise | Présences saisies hors ligne, synchronisées une seule fois |
| 5 | P2 | Erreurs silencieuses page Bulletins | `GET /grades/` par élève avec `.catch(() => items: [])` : une erreur affiche « — » au lieu d'un message | Erreur visible, test |
| 6 | P2 | Autres pages croisant `/students/?page_size=100` | Même schéma possible ailleurs, non audité dans ce lot | Recensement `grep page_size: 100` et correctifs ciblés |

Points hors périmètre automatisé, nécessitant une décision humaine : déploiement
en production, recette sur appareils réels, environnement sandbox Mobile Money,
test de charge sur une copie de production.
