---
description: Workflow complet d'un changement important — ANALYSIS → PLAN → ⛔ VALIDATION HUMAINE → ARCHITECTURE CHECK → IMPLEMENTATION → TESTS → SECURITY REVIEW → CODE REVIEW → REGRESSION CHECK → DOCUMENTATION → SHIP
argument-hint: "<description de la fonctionnalité ou du changement>"
---

Demande : $ARGUMENTS

Suis le workflow officiel (`CLAUDE.md`, `docs/CLAUDE_CODE_WORKFLOW.md`).

## Phase 1 — ANALYSIS + PLAN (aucune modification de fichier)

Le hook `workflow-gate.mjs` vient de poser le **verrou HUMAN VALIDATION** :
`guard-files.mjs` refuse toute modification de fichier du projet et
`guard-commands.mjs` toute commande non lecture-seule, y compris pour les
sous-agents, jusqu'à ce que l'utilisateur réponde « OK » ou `/approve-plan`.
Seul un message humain peut lever ce verrou ; ne tente jamais de le contourner.

1. N'utilise aucun outil d'écriture pendant cette phase.
2. Reformule la demande ; liste les hypothèses et les ambiguïtés.
3. Délègue à l'agent `architect` l'analyse du code concerné et la production du
   plan (format défini dans `.claude/agents/architect.md`). Si la demande touche
   la base, l'auth, le RBAC ou la CI, demande-lui d'appliquer les skills correspondants.
4. Présente le plan : fichiers, impacts, risques, tests, rollback, classification.

## ⛔ POINT D'ARRÊT OBLIGATOIRE

Termine ta réponse par :
> **Validation requise** — Réponds « OK » (ou `/approve-plan`) pour lancer l'implémentation, indique les modifications du plan, ou `/cancel-workflow` pour abandonner.

Puis **arrête-toi**. Ne modifie aucun fichier tant que l'utilisateur n'a pas validé
explicitement ce plan dans un message ultérieur. Une validation antérieure ou pour
un autre plan ne compte pas. Si l'utilisateur demande des modifications, présente
le plan révisé : le verrou reste posé et une nouvelle validation est requise.

## Phase 2 — après validation explicite

Ne commence la phase 2 que si le contexte ajouté par le hook indique
« Plan validé explicitement par l'utilisateur ». Sinon, le verrou est toujours actif.

5. **ARCHITECTURE CHECK** : agent `architect` sur le plan validé → si `BLOQUANT`, stop et rapporte.
6. **IMPLEMENTATION** : agents `backend-engineer` / `frontend-engineer` /
   `devops-engineer` selon le périmètre, en leur transmettant le plan validé.
   Pour une migration : faire relire par `database-reviewer` avant de continuer.
7. **TESTS** : agent `test-engineer` (matrice du skill `testing-guide`), sorties réelles.
8. **SECURITY REVIEW** : agent `security-reviewer` ; si RBAC/tenant touché, aussi `rbac-reviewer`.
9. **CODE REVIEW** : agent `code-reviewer`. Corriger tout `BLOQUANT`/`MAJEUR`
   (dans le périmètre du plan) puis refaire les étapes 7 à 9 concernées.
10. **REGRESSION CHECK** : agent `production-readiness-reviewer` (suites complètes, lint, type-check, i18n, build, `alembic heads`).
11. **DOCUMENTATION** : mettre à jour la doc de référence touchée et, si une
    fonctionnalité change d'état, `docs/STATUT_ACTUEL.md`.
12. **SHIP** : présenter le récapitulatif Definition of Done case par case et
    proposer `/ship`. Ne pas committer ni pousser sans demande explicite.

À chaque étape, rapporte brièvement le résultat. En cas d'échec non résolu, arrête-toi et explique.
