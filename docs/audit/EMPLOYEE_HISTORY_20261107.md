# EMPLOYEE-DELETE-01 — conservation des dossiers salariés

## Diagnostic P0 reproductible

Base vérifiée : `ac5d12a2c88f2a95211a708d89e721d4a8e0c2d1` (PR #426 fusionnée).
Six jobs réussis sur cette base ; aucune PR ouverte lors du contrôle initial.

`DELETE /hr/employees/{id}/` appelait directement `db.delete(employee)`.
Les trois relations ORM utilisent `all, delete-orphan`, et les clés étrangères
de `employment_contracts`, `payslips` et `leave_requests` utilisent CASCADE
(migration `20260224_0845_9a1b2c3d4e5f_add_hr_infrastructure.py`).

Avant correction : 4 échecs / 6 succès dans les nouveaux tests HTTP SQLite.
Le serveur renvoyait 200 avec suppression effective d'un contrat expiré,
d'un bulletin finalisé ou d'un congé approuvé. Désactiver le salarié ne
protégeait pas ces documents d'une suppression ultérieure.

## Politique et correction

- Un salarié sans contrat, paie ni congé reste supprimable.
- Tout historique de ces trois types bloque la suppression (409), quel que
  soit son statut. L'identité et le contenu des documents sont conservés.
- Désactiver via `PUT /hr/employees/{id}/` conserve le dossier et son historique.
  L'interrupteur manquait dans le formulaire : il est ajouté avec une explication.
- Le salarié est recherché dans le tenant courant et verrouillé avec FOR UPDATE
  avant lecture des dépendances. Les insertions de documents prennent un verrou
  PostgreSQL KEY SHARE via leur FK ; elles ne peuvent pas passer entre le
  contrôle et la suppression. Rollback sur refus ou absence.
- Permissions `hr:write` conservées ; rôles non autorisés toujours refusés.
- Aucune migration, aucune suppression historique ni anonymisation automatique.

## Validation

- SQLite local : 33 tests réussis sur suppression/historique, autorisations RH,
  règles de congés et limites de lecture ; un test PostgreSQL ignoré localement.
- Test PostgreSQL ajouté : insertion non validée d'un contrat, observation
  d'un vrai verrou bloquant via `pg_blocking_pids`, commit du contrat, refus
  de suppression et vérification des deux enregistrements.
- Deux tests de formulaire réussis : désactivation et modification d'un dossier
  déjà inactif sans réactivation accidentelle.
- Parcours Playwright ajouté sur pile réelle : salarié et paie créés via API,
  désactivation par formulaire, DELETE refusé 409, identité et paie conservées.
- Build local réussi. ESLint ciblé : zéro erreur, un avertissement `any`
  préexistant dans EmployeesTab. TypeScript et six jobs du HEAD : à confirmer
  dans les résultats de PR ; aucune réussite d'un ancien commit ne vaut preuve.

Les suites complètes et les parcours réels sont à valider par CI Linux.
Docker/PostgreSQL local indisponibles ; aucun succès local PostgreSQL revendiqué.

## Fichiers, impacts et limites

`backend/app/crud/hr.py`, `backend/app/api/v1/endpoints/operational/hr.py`,
`backend/tests/test_employee_delete_history.py`,
`src/components/human-resources/EmployeeDialog.tsx`, son test, `EmployeesTab.tsx`,
`tests/e2e/journeys/06-employee-history.spec.ts`.

L'interface reçoit un refus explicite au lieu d'un faux succès destructeur.
Le changement de statut du salarié ne désactive pas un éventuel compte
utilisateur : ces identités ne sont pas liées dans le modèle Employee.
La rétention, la suppression directe de documents RH et l'effacement contrôlé
restent des travaux distincts. Les documents précédemment perdus ne sont pas
restaurés par ce correctif. Aucun score global supplémentaire attribué.

Retour arrière : revert applicatif et frontend, sans migration ; cela
réintroduirait le risque de perte. Aucun déploiement ni fusion automatique.
Après ce lot : auditer la suppression des matières et ses dépendances académiques.
