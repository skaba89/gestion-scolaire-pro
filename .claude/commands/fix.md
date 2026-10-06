---
description: Correction de bug — cause racine, plan verrouillé jusqu'à validation humaine, test de reproduction, correctif minimal, revue
argument-hint: "<description du bug, message d'erreur, issue>"
---

Bug : $ARGUMENTS

Le hook `workflow-gate.mjs` vient de poser le **verrou HUMAN VALIDATION** :
aucune modification n'est possible avant la réponse « OK » (ou `/approve-plan`) de l'utilisateur.

## Phase 1 — analyse (lecture seule)

1. **Comprendre** : symptôme, périmètre, données/rôles/tenant concernés.
2. **Localiser** : lire le code ; identifier la cause racine (`fichier:ligne`), pas seulement le symptôme.
   Chercher la même erreur ailleurs (routes jumelles, `aliases.py`).
3. **Classer** :
   - **IMPORTANT** si le correctif touche auth, RBAC, tenant/RLS, migration, finance,
     middleware, CI/infra, une API publique, ou plus de 3 fichiers de production →
     plan complet (cause, correctif, impacts, tests, rollback).
   - **MINEUR** sinon → mini-plan de 3 à 5 lignes (cause, correctif, test).
4. Termine par :
   > **Validation requise** — Réponds « OK » (ou `/approve-plan`) pour corriger, ou `/cancel-workflow`.

   Puis arrête-toi.

## Phase 2 — après « Plan validé explicitement » (contexte ajouté par le hook)

5. **Test d'abord** : écrire un test qui reproduit le bug et échoue (sortie à l'appui).
6. **Correctif minimal** dans le périmètre ; pas de refactor opportuniste.
7. **Vérifier** : le test passe ; suite du domaine verte.
8. **Revue** : `security-reviewer` si le bug a une dimension sécurité ; `code-reviewer` dans tous les cas.
9. Récapitulatif Definition of Done ; proposer `/ship`. Pas de commit sans demande.
