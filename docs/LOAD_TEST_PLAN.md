# Plan de tests de charge multi-tenant — Academy Guinéenne

Phase 7 (audit national, finalisation avant commercialisation large).

Ce document pointe vers le plan **déjà écrit et déjà exécuté en partie**
plutôt que d'en dupliquer un autre — voir
[`docs/runbooks/load-testing.md`](runbooks/load-testing.md) pour le détail
complet (scénarios, seuils, comment lancer une campagne, comment
neutraliser le rate-limit de connexion pour une campagne autorisée). Ce
fichier en est un résumé orienté "palier 10/100/1000", au format demandé
par la feuille de route de commercialisation.

## Paliers

| Palier | Cible VUs | Statut | Détail |
|---|---|---|---|
| 10 tenants | jusqu'à 25 VUs | ✅ **Exécuté réellement**, 2 fois (2026-08-07, 2026-08-10) | [`docs/reports/LOAD_TEST_CAMPAIGN_2026-08-07.md`](reports/LOAD_TEST_CAMPAIGN_2026-08-07.md) |
| 100 tenants | jusqu'à 250 VUs | 🟡 **Exécuté localement, 2 fois** (10/08) — révèle un vrai point de rupture (23% d'échecs), mais sur ce poste de développement partagé, pas une instance Render correctement dimensionnée. **Non représentatif de la production**, résultats honnêtement rapportés comme tels | Idem, section "Suite immédiate — TIER=100" |
| 1000 tenants | jusqu'à 1000 VUs | ⚪ Praticable (script prêt), **jamais exécuté**, même localement | Voir "Ce qui manque" ci-dessous |
| 10 000 utilisateurs | — | 🔴 Non praticable sur ce poste de développement | Voir `docs/runbooks/load-testing.md`, section dédiée — provisioning d'infra requis, décision qui appartient à l'opérateur avec accès Render |

## Scénarios couverts par `load-tests/full-journey.js`

Login, dashboard (analytics/élèves/notifications), pages publiques
(navigation + une page, sans authentification), formulaire de contact
public, imports légers (aperçu CSV, sans confirmation — n'écrit rien en
base), paiement (création d'intent), webhook WhatsApp simulé (payload
façon Meta), rafale de synchronisation hors-ligne simulée (5 check-ins
consécutifs sans temps de réflexion). **Non couvert dans le script
actuel** : export CSV des messages (`GET /communication/.../export-csv/`
ou équivalent) — à ajouter comme un parcours de plus si un palier 100/1000
est exécuté.

## Métriques mesurées

`http_req_duration`/`http_req_failed` globaux + un `Trend` k6 dédié par
parcours (`flow_dashboard_ms`, `flow_public_pages_ms`,
`flow_contact_form_ms`, `flow_imports_ms`, `flow_payments_ms`,
`flow_whatsapp_webhook_ms`, `flow_offline_sync_burst_ms`) — un
ralentissement localisé ne se noie pas dans la moyenne agrégée. Côté
serveur, à croiser pendant la même fenêtre : p95 par endpoint
(Prometheus), taux d'erreur 5xx (logs structurés/Sentry), CPU/RAM
(dashboard Render par service), pool de connexions DB, longueur de file
Redis/lag du worker Arq (table `jobs`). Détail complet et requêtes SQL
exactes dans `docs/runbooks/load-testing.md`.

## Ce qui manque pour exécuter les paliers 100 et 1000

1. Un fichier `tenants.100.json`/`tenants.1000.json` (même format que les
   exemples `tenants.10.json`/`tenants.50.json` déjà dans `load-tests/`) —
   nécessite de provisionner ce nombre de tenants synthétiques au
   préalable, jamais pendant la campagne elle-même (la création de compte
   est elle-même limitée en débit).
2. Un environnement cible dimensionné pour représenter une charge
   régionale/nationale réelle — **pas** le poste de développement local
   (la campagne du 07/08 a déjà montré une dégradation sévère à
   seulement 25 VUs sur ce poste, conteneurs à 512 Mo/128 Mo). Voir
   `docs/runbooks/load-testing.md` pour le dimensionnement indicatif
   requis (instances API multiples, Postgres avec limite de connexions
   connue, Redis dédié, plusieurs sources IP pour le trafic k6).
3. Décision opérateur sur où exécuter cette campagne (staging dédié,
   jamais la production réelle) — hors périmètre de ce qu'un agent IA
   sans accès au compte cloud peut décider ou provisionner.

## Comment lancer

Voir `docs/runbooks/load-testing.md`, sections "Scénarios" et "Bypass du
rate-limit de connexion pour une campagne autorisée" — commandes exactes,
pas reproduites ici pour éviter la duplication qui diverge avec le temps.
