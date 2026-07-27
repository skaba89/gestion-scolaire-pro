# Monitoring par tenant (Phase 3 commercialisation)

Audit réel de ce qui existe pour l'observabilité et le support, sans
promesse au-delà de ce qui est vérifié dans le code.

## Métriques disponibles aujourd'hui

| Indicateur | Disponible | Source |
|---|---|---|
| `request_id` sur chaque requête | ✅ | `app/middlewares/request_id.py` — appliqué globalement, réutilise l'en-tête client s'il est fourni |
| Logs structurés | ✅ | format JSON avec `request_id`, `tenant_id`, `user_id`, `timestamp`, `level`, `logger` sur chaque entrée (déjà visible dans les logs SQLAlchemy capturés pendant les tests de cette session) |
| `tenant_id` dans les logs métier | ✅ | présent dans le format de log structuré ; vaut `"-"` quand hors contexte tenant (ex. bootstrap, endpoints plateforme) |
| Compteurs d'usage par tenant | ✅ | table `tenant_quota_usage` (`app/models/saas.py`) : `students_count`, `users_count`, `campuses_count`, `storage_used_mb`, `ai_requests_count`, `exports_count_today`, `last_calculated_at` |
| Quotas par tenant appliqués | ✅ | `app/middlewares/quota.py` — `max_students`/`max_teachers`/`max_staff` sur les créations, valeurs par défaut ou lues depuis `tenant.settings.quotas` |
| Statut tenant (actif/inactif) | ✅ | `Tenant.is_active`, déjà exposé sur `/ministry/overview/` en agrégat |
| Dernier backup | ✅ (niveau plateforme, pas par tenant) | `docs/BACKUP_SETUP.md` — sauvegarde quotidienne automatique, pas encore de statut par tenant individuel |
| Jobs en erreur | ✅ | table `jobs` (`app/models/job.py`) — statut `FAILED` filtrable par `tenant_id`, posée en Phase 5 d'un audit antérieur |
| Prometheus (plateforme globale) | ✅ | `GET /metrics/` — protégé par secret en production (voir `docs/SECURITY_MODEL.md`), mais **non ventilé par tenant** |

## Métriques manquantes

| Manque | Priorité | Pourquoi |
|---|---|---|
| Connexions par jour par tenant | P2 | Aucune table de log de connexion agrégée — seulement les sessions actives Redis (éphémères, pas d'historique) |
| Erreurs 4xx/5xx par tenant | P2 | Le middleware `metrics.py` (Prometheus) n'inclut pas `tenant_id` — voir stratégie ci-dessous |
| Temps de réponse moyen par tenant | P2 | Même limitation |
| Imports échoués par tenant (agrégé, pas juste le rapport d'un import) | P2 | Chaque import produit un rapport individuel (voir `docs/IMPORT_EXCEL_READINESS.md`) mais rien n'agrège "combien d'imports ont échoué ce mois pour ce tenant" |
| Alertes automatiques (5xx, paiement échoué, import échoué, backup échoué, tenant inactif) | P2 | Aucun système d'alerte configuré — actuellement, tout se découvre en consultant les logs ou `/health/ready` manuellement |
| Dashboard Grafana ou écran admin dédié | P2 | Les données existent partiellement (`tenant_quota_usage`, `jobs`) mais aucune vue agrégée ne les présente ensemble |

## Stratégie recommandée : table agrégée, pas Prometheus par tenant

L'audit demande explicitement d'éviter Prometheus par tenant si la
cardinalité est risquée — **c'est le bon choix ici**. Avec potentiellement
des centaines/milliers de tenants à terme, un label `tenant_id` sur les
métriques Prometheus (compteurs de requêtes, histogrammes de latence)
ferait exploser la cardinalité et dégraderait Prometheus lui-même
(problème connu et documenté dans l'écosystème Prometheus).

**Approche déjà amorcée et à privilégier** : la table `tenant_quota_usage`
existe déjà exactement dans cet esprit — une ligne par tenant, rafraîchie
périodiquement, interrogeable sans risque de cardinalité. Étendre cette
approche plutôt que d'ajouter des labels Prometheus :

1. Étendre `tenant_quota_usage` (ou une table sœur `tenant_health_snapshot`) avec : dernière connexion, nombre d'erreurs 5xx sur 24h, dernier import échoué, dernier backup réussi.
2. Peupler via un job planifié (l'infrastructure Arq déjà posée en Phase 5 d'un audit antérieur est directement réutilisable — pas de nouvelle techno à introduire).
3. Exposer un endpoint admin `GET /platform/tenants/{id}/health/` (super-admin/support uniquement) qui lit cette table.
4. Dashboard support = un simple écran frontend consommant cet endpoint, pas besoin de Grafana pour un premier support opérationnel.

## Alertes recommandées (à construire, pas encore en place)

| Alerte | Seuil suggéré | Canal |
|---|---|---|
| Taux d'erreur 5xx | > 5% des requêtes sur 15 min pour un tenant | Slack/email support |
| Paiement webhook échoué | tout échec de vérification de signature | Email immédiat (signal de fraude potentielle ou mauvaise config) |
| Import échoué | > 50% de lignes en erreur sur un import | Email au support + à l'établissement |
| Backup échoué | tout échec de sauvegarde quotidienne | Alerte immédiate équipe technique (P1 opérationnel) |
| Tenant inactif anormal | 0 connexion depuis 14 jours sur un tenant payant actif | Email commercial (risque de churn) |

## Dashboard support (à construire)

Un écran admin minimal suffit pour démarrer, pas besoin de Grafana :
liste des tenants avec statut, dernière activité, quota utilisé,
dernier backup, jobs en erreur récents — consommant l'endpoint de santé
par tenant recommandé ci-dessus.

## Limites actuelles

- Aucune alerte automatique n'existe à ce jour — toute anomalie doit être découverte manuellement via `/health/ready`, les logs, ou un ticket client.
- Le "dernier backup" n'est vérifiable qu'au niveau plateforme, pas encore par tenant individuel (peu critique tant qu'un seul cluster PostgreSQL sert tous les tenants — la sauvegarde est de toute façon globale).
- Aucune donnée personnelle n'est exposée dans les métriques actuelles (`/metrics` expose des compteurs Python/GC et des agrégats de requêtes, jamais de contenu métier) — à maintenir strictement lors de toute extension.
