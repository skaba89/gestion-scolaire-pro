# SchoolFlow Superset Analytics

Superset doit être connecté uniquement à la base analytique `schoolflow_analytics`.

## Interdiction

Ne jamais connecter Superset à la base OLTP `schoolflow_app_db`.

## Datasets Gold recommandés

| Dataset | Usage |
|---|---|
| gold.student_performance | performance & décrochage |
| gold.school_finance | finances école |
| gold.teacher_kpis | KPIs enseignants |
| gold.ministry_kpis | reporting institutionnel |

## RLS multi-tenant analytique

Chaque dataset doit filtrer par `tenant_id`.

Exemple :

```sql
tenant_id = '{{ current_user.tenant_id }}'
```

## Dashboards recommandés

### Direction école
- revenus
- présence
- performance
- risque décrochage

### Parents
- progression enfant
- devoirs
- alertes

### Ministère
- taux réussite
- effectifs
- abandon scolaire
- répartition géographique
