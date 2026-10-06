---
description: IMPLEMENTATION d'un plan explicitement validé — refuse de démarrer sans plan validé
argument-hint: "[précisions éventuelles]"
---

Précisions : $ARGUMENTS

1. **Précondition** : un plan figure dans cette conversation **et** l'utilisateur l'a
   validé explicitement après sa présentation. Sinon : ne modifie rien, explique
   qu'il faut d'abord `/project-plan` (ou `/feature`), et arrête-toi.
2. ARCHITECTURE CHECK rapide (`/arch-check`) si pas encore fait.
3. Délègue aux agents `backend-engineer`, `frontend-engineer`, `devops-engineer`
   selon le périmètre, en transmettant le plan validé tel quel.
4. Toute sortie du périmètre du plan → stop et demande.
5. Rapporte fichiers modifiés et vérifications lancées, puis propose `/test`.
