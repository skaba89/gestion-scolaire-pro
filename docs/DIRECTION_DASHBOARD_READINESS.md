# État de préparation — Dashboard Direction (Phase 4 commercialisation)

Audit réel de `backend/app/api/v1/endpoints/core/analytics.py` (1150+
lignes, très riche) — le dashboard direction backend est nettement plus
mature que ce que l'audit de départ laissait supposer.

## KPIs disponibles (vérifiés dans le code)

| KPI demandé | Disponible | Endpoint |
|---|---|---|
| Nombre total élèves | ✅ | `GET /analytics/dashboard-kpis/` |
| Enseignants actifs | ✅ | `GET /analytics/dashboard-kpis/` |
| Classes actives | ✅ | `GET /analytics/dashboard-kpis/` |
| Présence (taux, 30 derniers jours) | ✅ | `GET /analytics/dashboard-kpis/`, tendance détaillée sur `GET /analytics/attendance-trend/` |
| Notes moyennes | ✅ | `GET /analytics/dashboard-kpis/`, distribution détaillée sur `GET /analytics/grades-distribution/` |
| Élèves à risque | ✅ | `GET /analytics/students-at-risk/`, scores détaillés sur `GET /analytics/risk-scores/` |
| Impayés | ✅ | `GET /analytics/debt-aging/` (répartition par ancienneté) |
| Recettes du mois | ✅ | `GET /analytics/dashboard-kpis/` (revenu total/collecté/en attente), tendance sur `GET /analytics/revenue-trend/`, par catégorie sur `GET /analytics/revenue-by-category/` |
| KPIs académiques détaillés | ✅ | `GET /analytics/academic-kpis/`, `GET /analytics/academic-stats/` |
| KPIs opérationnels | ✅ | `GET /analytics/operational-kpis/` |
| Prévision de trésorerie | ✅ (bonus, non demandé explicitement) | `POST /analytics/cash-flow-forecast/` |
| Nouveaux élèves (période) | ⚠️ partiel | pas de compteur dédié "nouveaux ce mois", mais `totalStudents` et les tendances existent — filtrage par date à ajouter côté requête si besoin précis |
| Dépenses | ❌ | aucun module dépenses trouvé dans le code — seul le volet recettes existe |
| Incidents récents | ⚠️ module existe séparément | `operational/incidents.py` (audité en Phase 3 d'un audit antérieur, pagination + index déjà en place) — **pas encore agrégé dans le dashboard-kpis principal** |
| Messages non lus | ⚠️ module existe séparément | `operational/communication.py` existe — pas agrégé dans le dashboard principal |
| Tâches à faire | ❌ | aucun module "tâches"/todo trouvé dans le code |
| Alertes importantes | ⚠️ | dispersées entre plusieurs endpoints (élèves à risque, impayés) — pas de flux d'alertes unifié |

## Points forts déjà en place

- **Agrégation systématique côté backend** : chaque endpoint calcule ses totaux en SQL (`SUM`, `AVG`, `COUNT`), jamais de "charger toutes les lignes puis calculer côté client" — conforme à la règle "pas de chargement massif".
- **Scoping tenant strict** : chaque requête filtre explicitement par `tenant_id` extrait du token, jamais par un paramètre client.
- **Permission dédiée** : `analytics:read` requis sur chaque endpoint, cohérent avec le RBAC du reste du projet.

## Risque trouvé (à corriger, pas fait dans cette passe)

`get_dashboard_kpis()` capture toute exception et retourne silencieusement
des zéros partout (`except Exception: return {...tout à 0}`) plutôt que de
remonter une erreur exploitable. Cela **viole la règle "ne pas masquer les
erreurs"** : un directeur verrait un dashboard à zéro sans savoir si c'est
la réalité de son établissement ou une panne technique. Classé **P2** (le
comportement actuel ne casse rien et fail-safe plutôt que de planter,
mais masque un vrai problème potentiel). Correction recommandée : logger
l'erreur (déjà fait) ET retourner un indicateur explicite (`"degraded":
true` ou statut HTTP 200 avec un champ d'avertissement) plutôt que des
zéros indiscernables d'un établissement réellement vide.

Deux champs sont des placeholders codés en dur (`activeCourses: 0`,
`colleaguesCount: 0`) — cohérent avec le reste (e-learning existe comme
module séparé, pas encore branché ici), à retirer ou implémenter plus
tard, pas bloquant.

## Endpoints (référence)

```
GET  /analytics/dashboard-kpis/       vue d'ensemble (élèves, profs, classes, revenu, présence, moyenne)
GET  /analytics/academic-kpis/        KPIs académiques détaillés
GET  /analytics/academic-stats/       statistiques académiques
GET  /analytics/students-at-risk/     liste des élèves à risque
GET  /analytics/risk-scores/          scores de risque détaillés
GET  /analytics/operational-kpis/     KPIs opérationnels
GET  /analytics/financial-kpis/       KPIs financiers
GET  /analytics/debt-aging/           impayés par ancienneté
GET  /analytics/revenue-trend/        tendance de revenus
GET  /analytics/revenue-by-category/  revenus par catégorie
GET  /analytics/attendance-trend/     tendance de présence
GET  /analytics/grades-distribution/  distribution des notes
POST /analytics/cash-flow-forecast/   prévision de trésorerie
```

## Risques performance

Aucun risque majeur identifié dans le code audité : toutes les requêtes
sont déjà agrégées en SQL avec filtre `tenant_id`. Point de vigilance à
surveiller en production : les requêtes `AVG()`/`SUM()` sans limite de
période sur `grades`/`attendance` (ex. `grade_sql` dans
`get_dashboard_kpis`) recalculent sur l'historique complet à chaque appel
— acceptable pour un seul établissement, à revoir si le nombre de lignes
devient très important (ajouter un filtre sur l'année académique
courante par défaut).

## Priorités avant démo commerciale

1. **Corriger le masquage d'erreur** dans `get_dashboard_kpis()` (P2, rapide).
2. **Agréger incidents + messages non lus** dans le dashboard principal — les données existent déjà dans leurs modules respectifs, il s'agit de deux requêtes supplémentaires dans `get_dashboard_kpis()`, pas un nouveau module.
3. Le reste (nouveaux élèves sur la période, module dépenses, flux de tâches) peut attendre — pas nécessaire pour convaincre un directeur en 10 minutes, les KPIs déjà disponibles couvrent l'essentiel de l'argumentaire commercial.

**Audit frontend non fait dans cette passe** (composants React consommant ces endpoints, empty states, loaders) — à vérifier manuellement avant une démo réelle.
