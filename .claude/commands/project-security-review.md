---
description: SECURITY REVIEW du diff courant ou d'un périmètre — auth, tenant/IDOR, injection, XSS, SSRF, uploads, secrets, PII (lecture seule)
argument-hint: "[périmètre ; vide = diff courant vs main]"
---

Cible : $ARGUMENTS (vide = `git diff main...HEAD` + modifications non commitées).

Délègue à l'agent `security-reviewer` (checklist du skill `security-guide`).
Si des routes, permissions ou gardes changent, lance aussi `rbac-reviewer` en parallèle.
Aucune modification de fichier, aucune requête vers un environnement distant.

Restitue : verdict, failles classées avec scénario d'exploitation, correction et
test de régression attendu ; liste « vérifié / non vérifié ». Ne recopie jamais
un secret découvert — indique seulement son emplacement et recommande la rotation.
