---
name: review-guide
description: Grille de code review Academy Guinéenne — correction, sécurité, tenant/RBAC, tests, régression, qualité, i18n, migrations, documentation — avec niveaux de sévérité et format de rapport. À utiliser pour l'étape CODE REVIEW ou toute relecture de diff/PR.
---

# Code review

Périmètre par défaut : `git diff main...HEAD` + modifications non commitées
(`git diff`, `git status`). Lire les fichiers modifiés **en entier** autour des
changements, et leurs appelants.

## Grille

1. **Correction** : le code fait-il ce que le plan validé annonçait ? Cas limites
   (liste vide, None, doublons, fuseaux horaires, arrondis financiers) ?
2. **Sécurité** : checklist du skill `security-guide` (résumé : permission, tenant,
   IDOR, SQL paramétré, secrets, PII).
3. **RBAC** : 3 sources synchronisées si une permission change (`rbac-guide`).
4. **Données** : migration conforme (`database-guide`), transactions, rollback en erreur.
5. **Tests** : matrice minimale couverte (`testing-guide`) ; les tests échoueraient-ils sans le correctif ?
6. **Régression** : appelants, alias, contrat API front/mobile, comportements par défaut.
7. **Qualité** : idiome local respecté, pas de duplication, nommage, taille des fonctions,
   pas d'`except Exception` silencieux, pas de code mort ajouté, pas de `console.log`.
8. **Frontend** : i18n complet, états UI, `apiClient`, `sanitizeHtml`, accessibilité.
9. **Configuration** : nouvelles variables documentées et validées.
10. **Documentation** : doc de référence mise à jour si comportement/contrat change.
11. **Hors périmètre** : modifications non demandées → à signaler.

## Sévérités

- `BLOQUANT` — bug, faille, perte de données, régression : doit être corrigé avant SHIP.
- `MAJEUR` — risque réel ou dette significative : à corriger sauf décision explicite.
- `MINEUR` — qualité/lisibilité.
- `SUGGESTION` — optionnel.

## Format

```
## Verdict : APPROUVÉ | APPROUVÉ AVEC RÉSERVES | CHANGEMENTS REQUIS

| Sévérité | Fichier:ligne | Constat | Scénario concret | Correction proposée |
|---|---|---|---|---|

Vérifié : … (ce qui a été réellement lu/lancé)
Non vérifié : …
```

Ne rapporter que des constats vérifiés dans le code. Pas de reformulation du diff,
pas de compliments de remplissage.
