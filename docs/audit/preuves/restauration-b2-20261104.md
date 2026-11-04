<!-- Rapport produit par deploy/vps/scripts/exercice-restauration.sh sur le VPS de production, copié tel quel. Aucune donnée personnelle : comptages et noms de tables uniquement. -->

# Exercice de restauration — 2026-11-04T05:07:45+00:00

- Hôte : `vps-235d8499` · dépôt : `61d107b`
- Source : **b2** · image : `postgres:16-alpine` · base de production : **non modifiée** (lecture seule : oui)

## Contrôles

| Contrôle | Résultat | Détail |
|---|---|---|
| Récupération (B2, déchiffrement rclone) | ✅ | `schoolflow-20261104.sql.gz` · 52K · sha256 `5861a22b7152b198…` · 4s |
| Archive gzip intègre | ✅ | gzip -t |
| Restauration psql (ON_ERROR_STOP) | ✅ | 5s, aucune erreur |
| Révision Alembic | ✅ | `20261026_0001` |
| Tables restaurées | ✅ | 133 tables, 122 politiques RLS |
| RLS ENABLE+FORCE sur toutes les tables tenant | ✅ | 122 tables forcées / 118 avec tenant_id |
| Données présentes | ✅ | tenants=1 · users=2 · students=0 · classrooms=0 · enrollments=0 · grades=0 · attendance=0 · invoices=0 · payments=0 · audit_logs=8 |
| Relations (élèves, factures, paiements orphelins) | ✅ | 0 orphelin(s) |
| Factures : montant payé = somme des paiements encaissés | ✅ | 0 écart |
| Rôle restreint sans contexte tenant | ✅ | 0 élève visible (fail-closed) |
| Rôle restreint avec contexte d'un établissement | — | aucun élève dans le dump : non testable |
| Même révision que la production | ✅ | prod `20261026_0001` · dump `20261026_0001` (écart = migration postérieure au dump) |
| Même nombre de tables RLS forcées | ✅ | prod 122 · dump 122 |
| Élèves (prod / dump) | ℹ️ | 0 / 0 — l'écart correspond aux saisies depuis le dump (RPO) |

## Mesures

| Mesure | Valeur |
|---|---|
| **RPO** (âge du dump restauré) | **5 h** — dump quotidien : RPO maximal ≈ 24 h + délai de copie distante (03:00) |
| Téléchargement + déchiffrement | 4 s |
| Restauration | 5 s |
| Contrôles | 5 s |
| **RTO technique mesuré** | **19 s** (hors décision humaine, reconfiguration rclone sur une machine neuve et redéploiement applicatif) |

## Verdict

**RÉUSSI** — le dump de production se restaure et la base restaurée applique la RLS sous le rôle runtime.

_Conteneur et fichiers temporaires supprimés à la fin de l'exercice. Rapport sans donnée personnelle._
