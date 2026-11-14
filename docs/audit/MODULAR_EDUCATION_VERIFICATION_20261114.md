# Vérification du premier lot modulaire — 2026-11-14

PR : https://github.com/skaba89/gestion-scolaire-pro/pull/556
Branche : `feature/modular-education-platform`, base main `6323dce`.
Aucune production modifiée. Les résultats CI définitifs sont ceux du SHA courant
et des six contrôles requis de la PR ; aucun contrôle n'a été neutralisé.

## Exécutions locales

| Exécution | Résultat constaté | Limite |
|---|---|---|
| Audit préalable : PostgreSQL / frontend | 86 / 14 tests réussis | Échantillon des briques réutilisées |
| Non-régression SQLite complète, code publié c45da0f | 2449 réussis, 943 ignorés | Les scénarios PostgreSQL/Redis sont ignorés selon leurs prérequis |
| PostgreSQL 16.2 migré, lot + règles réutilisées | 154 réussis | Inclut RLS réelle, concurrence, historique et créations |
| Durcissement JSON + réentrée/non destruction migration, PostgreSQL | 36 réussis | Après la suite de 154 tests ; aucun test remplacé |
| Durcissement des JSON corrompus, SQLite | 32 réussis, 3 ignorés | Après la suite complète ; tests PostgreSQL spécifiques rejoués séparément |
| Frontend complet | 938 réussis, 137 fichiers | Avant le lien de navigation vers l'audit ; les 21 tests concernés ont été rejoués ensuite |
| Écran/modules/navigation mobile ciblés | 21 réussis | Vitest/jsdom, pas un téléphone physique |
| Build Vite, contrat frontend/API, i18n français | Réussis | Aucun nouvel appel sans route backend |
| TypeScript | 146 erreurs, seuil historique 146 | Aucun nouvel écart ; dette préexistante conservée |
| ESLint | 0 erreur, 1735 avertissements | Dette préexistante toujours visible |
| Premier PostgreSQL complet local | 3299 réussis, 53 ignorés, 5 échecs | Échecs DNS example.com dans les tests webhooks ; ce n'est pas une suite réussie |
| Nouveau parcours Playwright | Un cycle métier complet, avec contrôles bureau puis viewport mobile | Résultat d'exécution à lire dans la CI courante de la PR |

Les tests négatifs de politique exercent les vrais JWT, les rôles en base et
les dépendances FastAPI ; seul le service externe de révocation est contrôlé
pour isoler ces scénarios. Un test additionnel utilise un rôle PostgreSQL
NOSUPERUSER NOBYPASSRLS pour l'API et la nouvelle table. Les deux premières
écritures concurrentes ne peuvent pas obtenir la même révision. Une écriture
d'audit refusée annule la politique. Les tests de réentrée de migration
vérifient la conservation de la configuration et de son audit.

## Couverture fonctionnelle livrée

Catalogue neuf profils, création cohérente des niveaux, socle obligatoire,
dépendances et personnalisation, aperçu sans écriture, révision atomique,
audit strict, refus API des fonctions attribuées aux modules, aliases, admissions
publiques, bornes et imports différés ; navigation et pages des six portails,
champs LMD et administration responsive. L'inventaire JSON joint contient
les 690 opérations réelles, leur attribution et les surfaces communes/plateforme.
Le reporting historique du socle reste intentionnellement accessible avec RBAC.

## Maturité et risques résiduels

Ce lot vérifie un moteur **par établissement**. Il ne démontre pas une plateforme
pédagogique nationale complète. Il manque encore les restrictions réelles par
cycle et utilisateur, les règles héritées tenant/cycle/niveau avec versions
historiques, les compétences, ECUE, compensation, jurys et diplômes complets.
Le profil mixte est un tenant unique ; il ne fournit pas ces restrictions.
`cycle_policy_available=false` et compétences non activables évitent de vendre
ces capacités comme opérationnelles.

Aucun score global supplémentaire n'est calculé à partir d'un nombre de tests
ou de lignes de code. Les contrôles binaires ci-dessus sont mesurés ; couverture
terrain, migration d'une copie anonymisée, PRA, charge nationale et exploitation
restent NON VÉRIFIÉS. Le GO national et le score 99/100 ne sont pas acquis.

Le cache navigateur peut présenter une politique récente pendant 30 secondes ;
chaque appel API lit sa politique courante en base. Une requête déjà engagée
avant une désactivation n'est pas annulée rétroactivement. Les brouillons offline
refusés gardent la rétention existante de 24 h après résolution. Un retour au
code antérieur au moteur peut réouvrir des fonctions désactivées : suivre la
stratégie de récupération et conserver le contrôle serveur pendant l'incident.
