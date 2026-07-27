# Guide des migrations Alembic — SchoolFlow Pro

Conventions établies au fil des migrations de ce projet. À suivre pour
toute nouvelle migration afin de rester cohérent avec l'existant et éviter
les régressions déjà rencontrées.

## Règles absolues

- **Jamais de migration destructive** sans confirmation explicite de
  l'utilisateur : pas de `DROP COLUMN`/`DROP TABLE` sur des données déjà en
  production sans plan de sauvegarde préalable.
- Toute migration doit être **réversible** (`def downgrade()` implémenté
  réellement, pas un `pass`).
- **Idempotence obligatoire** : une migration doit pouvoir être rejouée
  sans erreur sur une base qui l'a déjà partiellement appliquée (utile en
  cas de redéploiement, de retry CI, ou d'environnements désynchronisés).

## Pattern idempotent établi

Utiliser les helpers déjà présents (voir migration `20260424_0001` pour
l'exemple de référence) :

```python
def _table_exists(bind, table_name: str) -> bool: ...
def _column_exists(bind, table_name: str, column_name: str) -> bool: ...
def _index_exists(bind, index_name: str) -> bool: ...
```

Chaque `CREATE TABLE`/`ADD COLUMN`/`CREATE INDEX` doit être gardé par le
helper correspondant plutôt que de s'appuyer sur `IF NOT EXISTS` seul —
certaines opérations (ex. ajout de colonne avec contrainte) n'ont pas
d'équivalent `IF NOT EXISTS` portable.

## Le piège des "tables fantômes"

Deux catégories de tables existent dans ce projet :

1. **Tables gérées par Alembic** (la grande majorité) — créées par une
   migration, modifiables par une migration suivante.
2. **Tables "fantômes"** — créées UNIQUEMENT par
   `app.core.operational_tables.ensure_operational_tables(engine)`, appelée
   au démarrage réel de l'application (`main.py`), SANS AUCUNE migration
   Alembic correspondante. Exemples confirmés : `incidents`, `appointments`,
   `teacher_assignments`, `homework` (voir le fichier
   `operational_tables.py` pour la liste complète).

**Conséquence pratique** : `alembic upgrade head` seul ne crée PAS ces
tables. Deux endroits l'oublient facilement :

- **Les migrations elles-mêmes** : si une migration ajoute un index sur une
  table fantôme, elle doit vérifier son existence avant, et l'ajout
  correspondant doit AUSSI être fait directement dans
  `operational_tables.py` (voir `20260724_0001` pour l'exemple : les index
  sur `incidents`/`appointments` sont dupliqués dans les deux endroits).
- **Les tests** : `get_test_client()` installe un lifespan no-op qui saute
  l'appel à `ensure_operational_tables()`. Tout test insérant dans une table
  fantôme doit l'appeler explicitement en tête de fichier :
  ```python
  from app.core.operational_tables import ensure_operational_tables
  ensure_operational_tables(engine)
  ```

## SQLite vs PostgreSQL en test

Le défaut de test est SQLite (rapide, pas de dépendance). Mais plusieurs
choses cassent silencieusement dessus :

- Toute requête SQL brute utilisant une syntaxe PostgreSQL-only
  (`NOW()`, `gen_random_uuid()`, `ARRAY()`, `::jsonb`) échoue sur SQLite —
  ces tests doivent utiliser
  `pytestmark = pytest.mark.skipif(engine.dialect.name != "postgresql", ...)`.
- Le type `GUID()` (`backend/app/models/base.py`) stocke les UUID en hex
  sans tirets sur SQLite, mais en chaîne standard sur PostgreSQL. Une
  requête `text()` brute comparant un UUID Python (`str(uuid_obj)`, avec
  tirets) à cette colonne échoue sur SQLite mais fonctionne sur PostgreSQL
  (colonne `uuid` native, tolérante aux deux formats). **Symptôme
  classique** : un test insère une ligne avec succès (log SQL visible) puis
  échoue en 404 sur la requête `SELECT` suivante — vérifier systématiquement
  contre PostgreSQL réel avant de conclure à un bug applicatif.

**Procédure de vérification recommandée** (utilisée tout au long de cette
série d'audits) : conteneur PostgreSQL éphémère isolé, jamais le port
standard d'un autre projet local :
```bash
docker run --rm -d --name schoolflow-test-pg -p <port-libre>:5432 \
  -e POSTGRES_DB=schoolflow_test -e POSTGRES_USER=schoolflow \
  -e POSTGRES_PASSWORD=testpassword postgres:16-alpine
# puis DATABASE_URL / DATABASE_URL_SYNC / DATABASE_URL_ASYNC pointant dessus
alembic upgrade head
pytest -q
```

**Piège d'environnement** : un fichier `.env` à la racine du repo (utilisé
par le serveur de développement local) définit `DATABASE_URL_SYNC` en
SQLite. `python-dotenv` (`load_dotenv()`) le charge dans l'environnement
SEULEMENT si la variable n'est pas déjà exportée — si un script exporte
`DATABASE_URL` mais pas `DATABASE_URL_SYNC`/`DATABASE_URL_ASYNC`
explicitement, ces deux dernières reviennent silencieusement au SQLite du
`.env` racine. Toujours exporter les trois variables explicitement.

## Avant toute migration touchant la production

- Sauvegarde vérifiée (voir `docs/BACKUP_SETUP.md`) avant tout
  `alembic upgrade` en production.
- Tester la migration ET son `downgrade()` sur un clone/instance isolée
  d'abord.
- Ne jamais exécuter de migration directement contre la base de production
  sans validation préalable en environnement de staging.
