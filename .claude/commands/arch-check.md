---
description: ARCHITECTURE CHECK — vérifie un plan validé (ou le diff courant) contre l'architecture du dépôt
argument-hint: "[référence du plan ou vide pour le diff courant]"
---

Cible : $ARGUMENTS (vide = plan validé le plus récent de la conversation, sinon `git diff main...HEAD`).

Délègue à l'agent `architect` l'application de la checklist du skill
`architecture-guide`. Rapporte le verdict `OK` / `OK avec réserves` / `BLOQUANT`
point par point. Aucune modification de fichier. Si `BLOQUANT`, propose
l'ajustement de plan et redemande la validation humaine.
