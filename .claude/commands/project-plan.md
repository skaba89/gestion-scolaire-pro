---
description: PLAN en lecture seule — plan d'implémentation (impacts, risques, tests, rollback) puis arrêt verrouillé pour validation humaine. Distinct de /plan natif (mode plan de Claude Code).
argument-hint: "<changement à planifier>"
---

Changement : $ARGUMENTS

Le hook `workflow-gate.mjs` vient de poser le **verrou HUMAN VALIDATION** : toute
modification de fichier du projet et toute commande non lecture-seule sont
refusées jusqu'à ce que l'utilisateur réponde « OK » (ou `/approve-plan`).

1. N'utilise aucun outil d'écriture (le mode plan natif `/plan` peut aussi être activé par l'utilisateur).
2. Délègue à l'agent `architect` (format de plan de `.claude/agents/architect.md`),
   en lui demandant de lire réellement le code concerné et ses appelants.
3. Présente le plan et la classification IMPORTANT / MINEUR.
4. Termine par :
   > **Validation requise** — Réponds « OK » (ou `/approve-plan`) pour lever le verrou et implémenter via `/implement`, indique les modifications du plan, ou `/cancel-workflow` pour abandonner.

Puis arrête-toi.
