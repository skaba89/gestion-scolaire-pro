---
description: CODE REVIEW du diff courant ou d'une branche selon la grille du dépôt (lecture seule)
argument-hint: "[branche, PR ou chemin ; vide = diff courant vs main]"
---

Cible : $ARGUMENTS (vide = `git diff main...HEAD` + modifications non commitées).

Délègue à l'agent `code-reviewer` (grille et format du skill `review-guide`).
Fournis-lui le plan validé s'il existe dans la conversation.
Aucune modification de fichier pendant la revue.

Restitue le verdict et les constats. Pour chaque `BLOQUANT`/`MAJEUR`, propose la
correction ; ne l'applique qu'après accord de l'utilisateur (ou dans `/feature`, si
la correction reste dans le périmètre du plan validé).
