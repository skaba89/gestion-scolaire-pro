# Dette technique — mesures et risques ouverts

Point de mesure : 2026-11-14, main vérifié `f5f0134` (#553), migration #555 en validation.

| Sujet | Mesure / état | Preuve | Priorité suivante |
|---|---|---|---|
| TypeScript | 146 erreurs historiques / référence 146, aucune nouvelle sur le lot établissements | Exécution locale `npm run type-check`, branche #553 | Réduire la dette par domaine, sans relever la référence |
| ESLint ciblé superadmin | 0 erreur / 6 avertissements | ESLint des deux fichiers frontend #553 | Types des erreurs/API et hooks concernés |
| ESLint global | 1735 avertissements / 0 erreur (1736 avant #553) | CI des branches #554 et #553 ; aucun seuil relevé | Réduire par domaine avec mesure préalable |
| Couverture backend PostgreSQL CI | 76,87 %, 3273 réussis / 1 ignoré | #552, run 43569446810 | Renforcer parcours critiques non couverts ; pas de confusion avec maturité |
| Couverture backend SQLite CI | 59,86 %, 2347 réussis / 927 ignorés | Même run | Réduire les différences UUID/SQL ; conserver PostgreSQL comme référence RLS/concurrence |
| Suppressions enseignant | CORRIGÉ dans main, non déployé | #552 | Déploiement autorisé et recette de rétention |
| Suppression facture dupliquée | CORRIGÉE, fusionnée, CI 6/6 | #554, alias délégué | Vérifier CI et intégration dans main |
| Purge établissement | Protection fusionnée, CI 6/6 | #553 | Export complet, pièces, restauration, conservation et gouvernance |
| Schéma notes/année | Réparation additive préparée | #555 | Préflight sur copie anonymisée, fenêtre de migration et rollback |
| Écritures et imports | Audit transversal incomplet | `SECURITY_RISK_REGISTER.md` | Matrice POST/PUT/PATCH, imports, tâches ARQ et webhooks ; opérations valides et résultats en base |
| Parcours métier | Actions exhaustives NON TESTÉES dans ce lot | Tests E2E/crawls ne couvrent pas tous les boutons/formulaires | Admission, scolarité, notes/bulletins, LMD, finance et portails |
| Production, charge, mobile | NON TESTÉS sur environnements réels ici | Aucun accès serveur/appareil dans ce lot | PRA représentatif, charge graduelle, Android/PWA/réseau terrain |

Éviter les nettoyages cosmétiques qui dispersent les corrections d'intégrité.
Chaque lot technique doit disposer d'une preuve de défaut et d'une validation
utile ; ne pas créer des tests qui ne font que recopier l'implémentation.
