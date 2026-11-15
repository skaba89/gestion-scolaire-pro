# Vérification du socle cycles pédagogiques — 2026-11-14

Branche : `feature/education-cycles`, base main `dd6fced`. Aucune opération de
production n'a été effectuée. Ce rapport ne transforme pas un test local en
preuve de déploiement ni en validation métier nationale.

## Périmètre livré

- table tenant-owned `education_cycles`, migration additive et downgrade non
  destructif ; aucun UPDATE/DELETE des données historiques ;
- rattachement nullable des niveaux avec clé étrangère composite inter-tenant ;
- création, modification, archivage et affectation des niveaux, avec révision,
  verrou PostgreSQL, permissions administrateur et audit dans la transaction ;
- création d'un cycle par défaut pour un nouvel établissement concret ; aucun
  cycle ni rattachement inventé pour un établissement mixte ou historique ;
- écran responsive de gestion des cycles, lecture seule pour les autres rôles,
  traductions française, anglaise, espagnole, arabe et chinoise ;
- indicateur `cycle_policy_available=false` maintenu : le registre de cycles
  n'est pas présenté comme une autorisation par cycle.

## Preuves locales exécutées

| Exécution | Résultat | Ce qu'elle prouve |
|---|---:|---|
| Backend ciblé SQLite | 61 réussis, 8 ignorés | API, RBAC négatif, conflits, audit, non-régression du moteur modulaire ; les 8 scénarios PostgreSQL sont différés |
| PostgreSQL 16.2 migré | 69 réussis | Migration réelle, clé composite, FORCE RLS avec rôle NOSUPERUSER/NOBYPASSRLS, concurrence, réentrée et conservation |
| Backend SQLite complet | 2 457 réussis, 948 ignorés | non-régression backend complète ; scénarios à prérequis PostgreSQL/Redis ignorés conformément à leurs marqueurs |
| Composants cycles + modules | 6 réussis | création, affectation, archivage et consultation seule dans l'interface |
| Frontend complet | 941 réussis, 138 fichiers | non-régression Vitest après intégration de l'écran cycles |
| Build Vite production | réussi, 5 270 modules transformés | compilation et génération des bundles ; avertissement de taille des bundles toujours présent |
| Contrôle i18n | réussi, aucune clé manquante | présence des libellés dans les cinq langues prises en charge |
| Contrôle TypeScript par baseline | 146 erreurs historiques, baseline 146 | aucune nouvelle erreur TypeScript ; la dette existante reste ouverte |

## Limites et risques restant ouverts

Les classes héritent aujourd'hui d'un cycle via leur niveau, mais les contrôles
d'accès ne dérivent pas encore systématiquement ce cycle depuis chaque ressource.
Les rôles restent tenant-scoped. Les politiques tenant → cycle → niveau, règles
de notation avancée par cycle, compétences, ECUE, compensation, jurys et diplômes ne
sont pas déclarés fonctionnels. Les établissements historiques doivent affecter
leurs niveaux explicitement. Une recette avec données anonymisées, tests de
charge nationale, PRA et validation métier terrain restent NON VÉRIFIÉS.

Les résultats CI de la PR, lorsqu'elle sera créée, devront être consignés après
exécution. Aucun test requis ne doit être annoncé vert avant son statut final.
