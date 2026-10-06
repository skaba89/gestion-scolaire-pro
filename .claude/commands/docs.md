---
description: DOCUMENTATION — met à jour la documentation de référence touchée par le changement courant
argument-hint: "[vide = diff courant]"
---

1. Inventaire : `git diff --stat main...HEAD` + `git diff --stat`.
2. Pour chaque changement de comportement, de contrat, de permission, de
   configuration ou d'exploitation, identifier la doc de référence (table « Sources
   de vérité » de `CLAUDE.md`) :
   - permission/rôle → `docs/PERMISSIONS_MATRIX.md` (+ `docs/INSTITUTIONAL_ROLES.md`)
   - sécurité → `docs/SECURITY_MODEL.md`
   - migration/schéma → `docs/MIGRATION_GUIDE.md` si nouvelle règle
   - variable d'env → `.env.example`, `.env.docker.example`, `.env.production.template`
   - exploitation → `docs/OPERATIONS_RUNBOOK.md` / `docs/runbooks/`
   - fonctionnalité qui change d'état → `docs/STATUT_ACTUEL.md` (date + commit)
3. Mettre à jour de façon minimale et factuelle, dans le style existant (français).
   Ne pas créer de nouveau document si une référence existe ; ne pas dupliquer de règles.
4. Lister les fichiers de doc modifiés et ceux volontairement non modifiés (et pourquoi).
