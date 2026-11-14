# SCHEMA-DRIFT-01 — FK des notes vers l'année scolaire

Référence : `8461420` (#551), schéma PostgreSQL 16.2 migré à `20261112_0002`.
Le modèle déclare `grades.academic_year_id → academic_years.id ON DELETE SET NULL`,
mais la contrainte manque réellement au catalogue. Le test de schéma échoue sur
cette version. Aucune lecture ni modification d'une base de production.

## Correctif additif préparé

Migration `20261114_0001`, une seule head après `20261112_0002` :

- Préflight de toutes les références non nulles ; en présence d'orphelins,
  arrêt avec le nombre de lignes, sans suppression, réaffectation ni troncature.
- Contrainte `NOT VALID` puis `VALIDATE CONSTRAINT` : les nouvelles écritures
  sont protégées, les lignes existantes sont validées dans la même transaction.
- Une FK existante équivalente est conservée et validée, sans doublon.
- Index sur `academic_year_id` si aucun index ne commence déjà par cette colonne ;
  modèle SQLAlchemy aligné. Pas de recalcul des moyennes ou modification de note.
- `lock_timeout=5s` local à la transaction : un verrou occupé arrête la migration
  plutôt que de bloquer indéfiniment les écritures.

## Tests exécutés

PostgreSQL : **25 réussis** (migration et `test_academic_period_delete_history.py`).
Tables temporaires avec données représentatives : notes 14/17, année valide et
année NULL, conservation exacte avant/après, upgrade répétable, downgrade sans
perte de données, refus d'un orphelin conservé sans modification. Vérification
du catalogue réel après `alembic upgrade head` : FK validée, ON DELETE conforme,
index présent. Les tests des années/trimestres et de leur concurrence restent verts.
SQLite : **20 réussis, 5 ignorés** ; les tests de migration PostgreSQL sont ignorés.

NON TESTÉ : copie anonymisée de production, volume national, durée des verrous
sur ce volume, déploiement et contrôles métier en production. Les données locales
sont synthétiques : ne pas les présenter comme une restauration de production.

## Analyse d'impact et récupération

La migration ne contient aucun UPDATE/DELETE des données historiques. L'ajout de
FK et l'index nécessitent des verrous DDL ; planifier une fenêtre adaptée au volume.
La validation et la construction de l'index sont transactionnelles et peuvent
allonger cette transaction. Exécuter avec le rôle propriétaire de migrations,
ayant visibilité complète sur les lignes malgré RLS ; pas avec le rôle API.

Avant tout déploiement autorisé : sauvegarde vérifiée/restaurée en environnement
isolé, capture des contraintes/index existants et contrôle des orphelins :

```sql
SELECT g.id, g.tenant_id, g.academic_year_id
FROM grades g
LEFT JOIN academic_years y ON y.id = g.academic_year_id
WHERE g.academic_year_id IS NOT NULL AND y.id IS NULL;
```

Si des références manquent : arrêter, rechercher l'année d'origine à partir des
sources scolaires vérifiées, obtenir validation métier, puis réparer dans une
procédure séparée et contrôlée. Ne pas mettre arbitrairement NULL, ne pas inventer
une année et ne pas supprimer les notes.

En cas de timeout/validation échouée, rollback transactionnel et version Alembic
inchangée ; lever le blocage avant une nouvelle tentative. Un rollback applicatif
reste possible (migration compatible). `alembic downgrade 20261112_0002` retire
uniquement les objets nommés par cette migration, sans retirer de colonne ni note ;
comparer auparavant la capture des objets préexistants et conserver tout index
qui existait avant l'intervention. Ce downgrade réintroduit le défaut FK :
privilégier le maintien de la protection lorsqu'un rollback applicatif suffit.

La règle SET NULL suit le modèle existant ; la suppression d'une année utilisée
reste interdite par les gardes API. Cette migration ne remplace pas l'audit des
écritures, ni les contrôles de tenant des identifiants.
