# Runbook — Métriques Prometheus SchoolFlow Pro

Ce document décrit les métriques exposées par l'API sur `GET /metrics`
(format Prometheus, désactivé automatiquement si `prometheus_client`
n'est pas installé).

## Métriques HTTP (middleware `app/middlewares/metrics.py`)

| Métrique | Type | Labels | Description |
|---|---|---|---|
| `http_requests_total` | Counter | `method`, `endpoint`, `status_code` | Toutes les requêtes HTTP. Les UUID et IDs numériques des chemins sont normalisés en `{id}` pour limiter la cardinalité. |
| `http_request_duration_seconds` | Histogram | `method`, `endpoint` | Latence des requêtes (buckets de 5 ms à 10 s). |
| `active_connections_total` | Gauge | — | Requêtes en cours de traitement. |

## Métriques métier

| Métrique | Type | Labels | Description |
|---|---|---|---|
| `business_events_total` | Counter | `event`, `outcome` | Événements métier critiques dérivés du trafic API. `outcome` vaut `success` (statut < 400) ou `failure`. |
| `authz_denied_total` | Counter | `method`, `endpoint` | Requêtes rejetées en 403 (refus d'autorisation RBAC/tenant). |

### Événements métier suivis (`event`)

| `event` | Déclencheur |
|---|---|
| `login` | `POST /api/v1/auth/login/` |
| `student_created` | `POST /api/v1/students/` |
| `invoice_created` | `POST /api/v1/invoices/` ou `POST /api/v1/payments/invoices/` |
| `payment_registered` | `POST /api/v1/payments/register/` |
| `payment_reversed` | `POST /api/v1/payments/{id}/reverse/` |
| `payment_intent_created` | `POST /api/v1/payments/intent/` (Mobile Money) |
| `payment_webhook_received` | Webhooks CinetPay / PayTech |

Le mapping est centralisé dans `_BUSINESS_EVENTS`
(`app/middlewares/metrics.py`). Pour suivre un nouvel événement, ajouter
une entrée `(méthode, chemin normalisé sans slash final) → nom_event` et
couvrir le chemin dans `tests/test_business_metrics.py`.

## Scrape Prometheus

```yaml
scrape_configs:
  - job_name: schoolflow-api
    metrics_path: /metrics
    static_configs:
      - targets: ["api:8000"]
```

## Exemples d'alertes (PromQL)

```yaml
groups:
  - name: schoolflow
    rules:
      - alert: LoginFailureSpike
        expr: rate(business_events_total{event="login",outcome="failure"}[5m]) > 1
        for: 10m
        labels: {severity: warning}
        annotations:
          summary: "Pic d'échecs de connexion (possible brute-force)"

      - alert: AuthzDeniedSpike
        expr: sum(rate(authz_denied_total[5m])) > 0.5
        for: 10m
        labels: {severity: warning}
        annotations:
          summary: "Pic de 403 — tentative d'accès inter-tenant possible"

      - alert: HighErrorRate
        expr: >
          sum(rate(http_requests_total{status_code=~"5.."}[5m]))
          / sum(rate(http_requests_total[5m])) > 0.05
        for: 5m
        labels: {severity: critical}
        annotations:
          summary: "Plus de 5 % de réponses 5xx"

      - alert: HighLatencyP95
        expr: >
          histogram_quantile(0.95,
            sum(rate(http_request_duration_seconds_bucket[5m])) by (le)) > 2
        for: 10m
        labels: {severity: warning}
        annotations:
          summary: "Latence p95 supérieure à 2 s"

      - alert: NoPaymentsRecorded
        expr: increase(business_events_total{event=~"payment_.*",outcome="success"}[24h]) == 0
        for: 1h
        labels: {severity: info}
        annotations:
          summary: "Aucun paiement confirmé depuis 24 h (à vérifier en période scolaire)"
```

## Vérification rapide

```bash
curl -s http://localhost:8000/metrics | grep business_events_total
```
