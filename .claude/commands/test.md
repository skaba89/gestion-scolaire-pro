---
description: TESTS — écrit les tests manquants pour le changement courant et exécute les suites concernées, avec sorties réelles
argument-hint: "[périmètre ou fichiers ; vide = diff courant]"
---

Périmètre : $ARGUMENTS (vide = `git diff main...HEAD` + `git diff`).

Délègue à l'agent `test-engineer` :
1. Établir la matrice de cas (skill `testing-guide`) pour chaque endpoint/composant modifié.
2. Écrire les tests manquants (fichiers de test uniquement).
3. Lancer : tests ciblés → suite du domaine → (si demandé ou avant SHIP) suites complètes :
   - `cd backend && python -m pytest tests/ -q`
   - `npx vitest run`
4. Rapporter les totaux réels, les échecs analysés, et ce qui reste à valider en CI
   (RLS PostgreSQL, E2E).

Si un test révèle un bug de production : ne pas le corriger ici — le rapporter et proposer `/fix`.
