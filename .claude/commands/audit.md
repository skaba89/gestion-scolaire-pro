---
description: ANALYSIS en lecture seule — audit d'un module, d'un fichier, d'un flux ou du dépôt (architecture, sécurité, RBAC, tests, dette, risques)
argument-hint: "<périmètre : module, chemin, fonctionnalité, ou \"repo\">"
---

Périmètre : $ARGUMENTS

**Lecture seule** : ne crée, ne modifie, ne supprime aucun fichier ; aucune
migration, aucun commit, aucun appel distant.

1. Délimite le périmètre (fichiers backend, frontend, tests, docs concernés).
2. Lis réellement le code ; s'appuie sur les skills `architecture-guide`,
   `security-guide`, `rbac-guide`, `testing-guide`, `performance-guide` selon le sujet.
   Pour un large périmètre, délègue en parallèle aux agents en lecture seule
   pertinents (`architect`, `security-reviewer`, `rbac-reviewer`, `performance-reviewer`).
3. Restitue :
   - fonctionnement actuel (avec `fichier:ligne`) ;
   - risques classés (Critique/Haute/Moyenne/Basse) avec scénario concret ;
   - dette technique, duplication, code mort probable (à confirmer avant suppression) ;
   - tests existants et manquants ;
   - écarts documentation ↔ code ;
   - recommandations priorisées, chacune marquée IMPORTANT (→ `/feature` ou `/fix`) ou MINEUR.
4. Distingue « vérifié » de « supposé ». Ne recopie jamais un secret rencontré.
