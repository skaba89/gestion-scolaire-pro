---
description: Audit go/no-go production — sécurité runtime, base et RLS, configuration, observabilité, sauvegardes, rollback (lecture seule)
argument-hint: "[release, branche ou périmètre ; vide = branche courante]"
---

Cible : $ARGUMENTS (vide = branche courante vs `main`).

Délègue à l'agent `production-readiness-reviewer` (skill `production-readiness-guide`).
Aucune modification de fichier ; aucune commande vers un environnement distant :
les points qui exigent l'environnement cible (variables réelles, rôle DB, Sentry,
sauvegarde restaurée) sont listés « à vérifier par l'opérateur » avec la commande
ou le contrôle à effectuer.

Restitue `GO` / `GO sous conditions` / `NO-GO` avec le tableau
`point | vérifié | non vérifié | non applicable` et les conditions restantes.
