---
description: SHIP — vérification finale Definition of Done, puis commit et PR uniquement sur confirmation explicite (jamais de déploiement)
argument-hint: "[message ou titre de PR optionnel]"
---

Contexte : $ARGUMENTS

1. **Branche** : si la branche courante est `main`, proposer une branche
   `type/description` et attendre l'accord avant de la créer.
2. **Inventaire** : `git status`, `git diff --stat`, `git diff --stat main...HEAD`.
   Vérifier qu'aucun fichier sensible n'est inclus (`.env*` hors templates,
   `infra/backups/`, `azure-logs*`, `*.db`, `coverage/`, `dist/`, clés) et qu'aucun
   secret n'apparaît dans le diff (recherche de motifs ; ne jamais afficher une valeur).
3. **Definition of Done** (`CLAUDE.md`) : présenter chaque case avec sa preuve
   (sortie de test, revue, doc) ou « non vérifié » / « non applicable ».
   Si une case bloquante est non satisfaite → s'arrêter.
4. **Proposition** : liste des fichiers à indexer (jamais `git add -A` / `git add .`),
   message de commit Conventional Commits, titre et corps de PR (contexte, changements,
   tests, risques, rollback).
5. **⛔ Attendre une confirmation explicite** avant `git commit`, puis une autre
   avant `git push` / `gh pr create`. Jamais `--force`, jamais `--no-verify`.
6. Ne jamais déployer, ni déclencher de workflow de déploiement.

Attribution : suivre les consignes d'attribution de commit/PR en vigueur dans la session.
