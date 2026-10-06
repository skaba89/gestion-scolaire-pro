---
description: Abandonne le workflow en cours et lève le verrou HUMAN VALIDATION sans rien implémenter
argument-hint: "[raison]"
---

L'utilisateur abandonne le workflow en cours. Raison : $ARGUMENTS

Le hook `workflow-gate.mjs` a effacé le verrou. Ne rien implémenter du plan
abandonné. Résumer en une ou deux lignes ce qui avait été analysé ou planifié,
pour que l'utilisateur puisse y revenir plus tard.
