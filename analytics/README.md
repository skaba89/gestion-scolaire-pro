# SchoolFlow Analytics Platform

Ce dossier sépare clairement la partie **opérationnelle OLTP** de la partie **analytique OLAP / IA**.

## Règle d'or

- Le backend FastAPI et le frontend utilisent la base opérationnelle `schoolflow_app_db`.
- Superset, dbt, MLflow et les modèles IA utilisent uniquement la base analytique `schoolflow_analytics`.
- Aucune requête dashboard lourde ne doit être exécutée sur la base OLTP.

## Architecture cible

```text
SchoolFlow OLTP PostgreSQL
        ↓
CDC / Export / Airflow
        ↓
bronze
        ↓
silver
        ↓
gold
        ↓
Superset / MLflow / AI services
```

## Dossiers

```text
analytics/
├── airflow/       # DAGs d'orchestration analytique
├── dbt/           # transformations bronze/silver/gold
├── docs/          # architecture et runbooks analytics
├── ml/            # features et modèles ML
├── superset/      # assets dashboards et configuration BI
└── docker-compose.analytics.yml
```

## Commandes principales

```bash
cd analytics
docker compose -f docker-compose.analytics.yml up -d
```

## Schémas analytiques

- `bronze` : données brutes répliquées depuis OLTP.
- `silver` : données nettoyées, typées, dédupliquées.
- `gold` : data marts métier optimisés pour Superset, IA et reporting institutionnel.
- `ml` : features ML et prédictions.
- `monitoring` : métriques de pipelines et qualité.
