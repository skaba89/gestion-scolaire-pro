---
name: production-readiness-guide
description: Checklist go/no-go de mise en production Academy Guinéenne — sécurité runtime, base de données et RLS, configuration, observabilité, sauvegardes, rollback, conformité. À utiliser avant une release, pour l'étape SHIP d'un changement à risque, ou pour un audit de readiness.
---

# Production readiness

Références : `docs/runbooks/production-readiness.md` (checklist opérationnelle),
`docs/PRODUCTION_RUNBOOK.md`, `docs/OPERATIONS_RUNBOOK.md`, `docs/DRP_GUIDE.md`,
`docs/BACKUP_SETUP.md`, `docs/SENTRY_SETUP.md`, `docs/TENANT_MONITORING.md`, `docs/SLA.md`.

## Go / No-Go — release

**Sécurité runtime**
- [ ] `DEBUG=false` (désactive `/docs` et l'OpenAPI publique)
- [ ] `SECRET_KEY` fort, propre à l'environnement ; `BOOTSTRAP_SECRET` défini et non réutilisé
- [ ] `LOAD_TEST_BYPASS_SECRET` absent en production
- [ ] CORS sans wildcard ; origines exactes
- [ ] Rôle DB applicatif sans SUPERUSER ni BYPASSRLS (log de démarrage + `/health/ready`)
- [ ] MFA effective pour les rôles privilégiés ; `AUTH_PRIVILEGED_FAIL_CLOSED` conforme à la politique
- [ ] Aucun secret dans l'image, les logs, le dépôt (gitleaks vert)

**Base de données**
- [ ] Migration exécutée par l'étape dédiée, révision DB = head attendue
- [ ] Migration réversible ; changement destructif précédé d'une sauvegarde vérifiée
- [ ] Sauvegarde récente **restaurée avec succès** (pas seulement créée)

**Application**
- [ ] CI verte sur le SHA exact déployé ; image identifiée par SHA/digest
- [ ] Variables nouvelles présentes dans l'environnement cible et dans les templates
- [ ] Workers ARQ démarrés, heartbeat visible
- [ ] Stockage objet joignable (readiness)

**Observabilité**
- [ ] Sentry backend + frontend avec environnement et release corrects, scrubbing PII
- [ ] Métriques et alertes (5xx par tenant, inactivité, échecs d'import) actives
- [ ] Logs structurés corrélés par `X-Request-ID`

**Exploitation**
- [ ] Plan de rollback écrit (image précédente + compatibilité schéma)
- [ ] Runbook à jour pour toute nouvelle dépendance externe (email, WhatsApp, paiement local)
- [ ] Communication aux établissements si interruption ou changement visible

## Changement à risque (étape SHIP)

Répondre explicitement : impact déploiement, ordre migration/app, compatibilité
N-1, rollback, données touchées, surveillance post-déploiement (quoi, combien de temps).

## Sortie

`GO` / `GO sous conditions` / `NO-GO`, avec la liste des cases non vérifiées
et la raison. Ne jamais cocher une case non vérifiée.
