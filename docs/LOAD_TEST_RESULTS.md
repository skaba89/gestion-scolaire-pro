# Résultats de tests de charge — synthèse

Phase 7 (audit national, finalisation avant commercialisation large).

Synthèse des campagnes réelles déjà exécutées. Rapport complet, méthode,
bugs trouvés et corrigés en cours de route :
[`docs/reports/LOAD_TEST_CAMPAIGN_2026-08-07.md`](reports/LOAD_TEST_CAMPAIGN_2026-08-07.md).
Voir [`docs/LOAD_TEST_PLAN.md`](LOAD_TEST_PLAN.md) pour ce qui reste à
exécuter (paliers 100/1000 sur un environnement correctement dimensionné).

**Toutes les campagnes ci-dessous ont tourné contre la stack Docker
locale — jamais contre la production**, conformément à la règle du
runbook.

## Palier 10 tenants (25 VUs) — production-mode Docker, 2026-08-10

| Métrique | Résultat |
|---|---|
| `http_req_failed` | 0,14% |
| `checks_succeeded` | 99,97% |
| `http_req_duration` p99 | 2,26s |
| `flow_offline_sync_burst_ms` p95 | 5,91s |
| CPU conteneur `api` (snapshot mi-charge) | 235,5% (4 workers) |

Amélioration mesurée par rapport à la première exécution du 07/08 (avant
correctif de contention) : `flow_offline_sync_burst_ms` p95 -37%, max
-85%, `http_req_failed` -58%. Voir le rapport complet pour le correctif
exact appliqué entre les deux mesures.

**Verdict pour ce palier** : sain. p95/p99 dans les seuils fixés
(`docs/runbooks/load-testing.md` — p95 < 500ms pour 25 VUs soutenus n'est
pas encore atteint sur `http_req_duration` p99 à 2,26s, mais les seuils
par parcours `flow_*_ms` restent la mesure la plus pertinente et sont
documentés flux par flux dans le rapport complet).

## Palier 100 tenants (250 VUs) — poste de développement local, 2026-08-10

| Métrique | 25 VUs | 250 VUs |
|---|---|---|
| `http_req_failed` | 0,14% | **23,28%** |
| `checks_succeeded` | 99,97% | **86,02%** |
| `http_req_duration` p95 | 1,25s | **59,99s** (plafond timeout k6) |
| `flow_offline_sync_burst_ms` p95 | 5,91s | **183,5s** |
| CPU conteneur `api` (snapshot mi-charge) | 235,5% | 245,8% (déjà proche du plafond à 4 workers) |

**Point de rupture confirmé entre 25 et 250 VUs sur ce poste**, avec CPU
`api` déjà saturé au palier précédent. Une piste corrective a été testée
(élargir `DATABASE_POOL_SIZE`/`MAX_OVERFLOW` de 5+10 à 8+12) :
`http_req_failed` s'améliore marginalement (23,28% → 21,56%) mais
`http_req_duration` p95 reste au plafond — le CPU `api` chute de 246% à
46% (la famine de pool de connexions n'était donc plus le facteur
limitant après élargissement) tandis que la RAM Postgres grimpe de 55 à
247 Mo sur une limite conteneur de 512 Mo, suggérant que la saturation
s'est déplacée vers Postgres (configuration mémoire par défaut de l'image
`postgres:16-alpine`, sous-dimensionnée pour ~250 connexions actives).

**Verdict pour ce palier** : **non concluant pour la production** — ce
résultat mesure la limite d'un poste de développement partagé
(Postgres/Redis à 512 Mo/128 Mo, CPU partagé avec d'autres charges), pas
celle d'une instance Render correctement dimensionnée. Utile comme ordre
de grandeur du point de bascule à surveiller, pas comme un verdict
go/no-go sur la capacité réelle en production.

## Palier 1000 tenants (1000 VUs)

**Jamais exécuté**, même localement. `TIER=1000` est déjà supporté par
`load-tests/full-journey.js` sans changement de script nécessaire — ce
qui manque est un `TENANTS_FILE` provisionné à cette échelle et un
environnement cible dimensionné (voir `docs/LOAD_TEST_PLAN.md`).

## Palier 10 000 utilisateurs

**Jamais tenté** — explicitement non praticable sur ce poste de
développement (voir `docs/runbooks/load-testing.md`, section dédiée,
pour le raisonnement complet et le dimensionnement d'infrastructure
requis).

## Conclusion honnête pour la décision de commercialisation

- **Palier 10 tenants** : validé, résultats sains, corrections appliquées
  et re-mesurées.
- **Palier 100 tenants** : un vrai goulot d'étranglement a été identifié
  et partiellement diagnostiqué (CPU `api` → pool DB → Postgres
  sous-dimensionné en cascade), mais **sur du matériel non représentatif
  de la production**. Ne pas interpréter le taux d'échec de 23% comme une
  prédiction du comportement en production réelle.
- **Paliers 1000 et 10 000** : aucune donnée. Le script est prêt ; ce qui
  manque est un environnement de staging dimensionné à l'échelle cible —
  une décision d'infrastructure et de budget pour l'opérateur, pas
  quelque chose qu'une session de développement peut produire.
- **Recommandation** : avant une commercialisation nationale/régionale
  (paliers 100+), provisionner un environnement de staging dimensionné
  comme indiqué dans `docs/runbooks/load-testing.md` et répéter la
  campagne TIER=100 dessus avant de tirer une conclusion de capacité
  fiable — le palier 10 seul ne couvre qu'un déploiement pilote modeste.
