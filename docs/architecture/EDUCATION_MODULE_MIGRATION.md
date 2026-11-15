# Migration et contrat technique du moteur modulaire

## Stockage et compatibilité

La migration additive `20261114_0002`, après `20261114_0001`, ajoute
`tenants.education_modules_configured` (false pour l'existant) et
`education_configurations` (clé primaire tenant_id, profil, overrides JSON,
révision ≥ 1, horodatages). Aucun UPDATE/DELETE des données scolaires. La colonne
sépare la décision de sécurité des réglages JSON génériques modifiables.

Le catalogue version 1 réutilise les services existants : 22 entrées, dont huit
du socle et une indisponible. Les anciens tenants restent en mode compatible,
avec leurs capacités antérieures, jusqu'à une première validation explicite.
Les trois créations (`/tenants/`, `/tenants/create-with-admin/`, inscription
publique) initialisent le profil et l'audit dans leur transaction existante.

La migration additive suivante `20261114_0003` crée `education_cycles` et ajoute
`levels.cycle_id` nullable. Sa clé étrangère composite
`(tenant_id, cycle_id) → (education_cycles.tenant_id, id)` interdit en base le
rattachement à un cycle d'un autre établissement. Elle ne réaffecte aucun niveau
historique : une attribution ambiguë reste explicitement vide. Les nouveaux
établissements non mixtes reçoivent un cycle concret unique et leurs niveaux
initiaux y sont rattachés ; un établissement mixte ne reçoit aucun cycle inventé.

## API et cohérence

- GET `/education/catalog/` : catalogue/version et propositions de niveaux.
- GET `/education/configuration/` : politique du tenant authentiquement résolu.
- POST `/education/preview/` : profil/overrides/révision attendue ; aucune écriture.
- PUT `/education/configuration/` : verrou FOR UPDATE du tenant, contrôle de
  révision, validation stricte, audit obligatoire puis commit atomique.
- GET/POST `/education/cycles/` : consultation et création de cycles concrets.
- PATCH `/education/cycles/{id}/` : modification ou archivage sans suppression.
- PUT `/education/cycles/{id}/levels/` : affectation complète des niveaux, avec
  verrou, révision attendue et refus des niveaux étrangers ou déjà affectés.

Les écritures exigent `settings:write` et TENANT_ADMIN ou SUPER_ADMIN. Les champs
supplémentaires, dépendances manquantes, valeurs non booléennes, modules inconnus
ou absents sont refusés. Une configuration manquante/corrompue sur un tenant
configuré refuse les fonctions optionnelles avec 503 ; le socle reste accessible.

L'authentification réelle contrôle la politique en base à chaque requête métier
attribuée dans `education_paths.py`, indépendamment du cache de navigation.
Les admissions publiques, scans de borne et services d'import partagent le même
contrôle après résolution du tenant. Les champs ECTS/semestre/prérequis sont
protégés même par l'API générique des matières. Le reporting historique du socle
reste disponible avec son RBAC. L'inventaire des opérations et les tests d'alias
précisent cette frontière ; ce n'est pas une isolation par cycle.

RLS ENABLE + FORCE et politique USING/WITH CHECK sur tenant_id s'appliquent aux
deux nouvelles tables de configuration. Les tests utilisent un rôle NOSUPERUSER NOBYPASSRLS, lisent
sans contexte/avec contexte, tentent une insertion étrangère et appellent l'API.
Les deux premiers writes concurrents ne peuvent pas gagner la même révision.
Aucun cache global de politique ne retarde une révocation côté serveur.

## Ordre d'installation et retour arrière

Migration avec lock_timeout 5 s sur PostgreSQL ; préparer les droits de la table
pour le rôle applicatif selon la procédure existante, et déployer tous les API
et workers capables de faire respecter cette politique avant toute activation.
Tester le tout sur copie anonymisée et sauvegarde restaurable avant production.
Aucune de ces opérations de production n'a été effectuée dans ce travail.

Le downgrade est volontairement non destructif : il conserve colonnes, table et
politiques, et un nouvel upgrade est idempotent. **Un retour à du code antérieur
au moteur ne respecte pas les modules désactivés**. Après activation, conserver
une version qui applique le contrôle ou restreindre l'accès applicatif pendant
l'incident ; ne pas annoncer un rollback ancien comme sûr du seul fait que les
données ont été conservées. Privilégier un correctif forward.

## Lots restant à construire et à vérifier

Le registre de cycles, le rattachement validé des niveaux et l'héritage des
règles tenant → cycle → niveau sont présents. Les UE tenant-isolated et leur lien
optionnel vers les matières/ECUE sont additifs et conservent les historiques. Il
reste le rattachement dérivé de toutes les ressources, les permissions par
cycle/utilisateur, les compétences, la compensation, les jurys et diplômes
complets. Les historiques sans cycle
ne seront pas attribués automatiquement. Tant que toutes les routes concernées
ne dérivent pas leur périmètre de la ressource réelle, `cycle_policy_available`
reste false. Le changement d'abonnement conserve la logique existante sans
suppression métier ni purge de configuration.
