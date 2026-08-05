# Runbook opérationnel — Academy Guinéenne

Audit national Phase 6. Toutes les commandes ci-dessous sont réelles, tirées du code de ce dépôt — pas de placeholder générique.

---

## 1. Comment redémarrer

**Docker Compose (local / VPS pilote) :**
```bash
docker compose --env-file .env.docker restart api          # API seule
docker compose --env-file .env.docker restart worker       # Worker de jobs (Phase 5)
docker compose --env-file .env.docker restart               # Toute la stack
docker compose --env-file .env.docker up -d --build api     # Après un changement de code backend
```

**Vérifier que le redémarrage a réussi :**
```bash
docker compose ps                                    # Tous les services "healthy"
curl http://localhost:8000/health/live                # {"status":"alive",...}
curl http://localhost:8000/health/ready                # {"status":"healthy",...} — voir §3
```

Le service `worker` (Arq) n'a pas de healthcheck HTTP — s'il est arrêté, l'API continue de fonctionner et retombe sur l'ancien chemin `BackgroundTasks` pour les tâches migrées (voir `docs/ASYNC_JOBS_GUIDE.md`). Vérifier ses logs pour confirmer qu'il traite la file :
```bash
docker compose logs -f worker
```

---

## 2. Comment restaurer un backup

Scripts réels : `scripts/backup-database.sh` / `scripts/restore-database.sh`, testés automatiquement en CI (`.github/workflows/ci.yml`, job `backend-tests`) et par le service `db-backup` (`docker-compose.yml`, image `prodrigestivill/postgres-backup-local`).

```bash
# 1. Lister les backups disponibles
ls -la backups/

# 2. Restaurer en mode "vérification uniquement" (par défaut — ne touche pas la base)
bash scripts/restore-database.sh backups/<fichier>.sql.gz

# 3. Restauration réelle — nécessite une confirmation explicite exacte
#    (le script refuse toute confirmation approximative, par design)
bash scripts/restore-database.sh backups/<fichier>.sql.gz --confirm="RESTORE PRODUCTION"
```

**Avant toute restauration réelle sur une base contenant des données de production** : prendre un backup de l'état actuel d'abord (`bash scripts/backup-database.sh`), même si l'état actuel semble corrompu — il peut contenir des données récentes non présentes dans le backup à restaurer.

---

## 3. Comment vérifier la santé du système

```bash
curl http://localhost:8000/health/ready | python -m json.tool
```

Réponse attendue (`200`, `"status":"healthy"`) :
```json
{
  "status": "healthy",
  "version": "...",
  "components": {
    "database": "connected",
    "cache": "connected",
    "rls": "active",
    "storage": "connected"
  }
}
```

| Composant | Valeur saine | Valeur problématique | Action |
|---|---|---|---|
| `database` | `connected` | `unreachable` | Vérifier que `postgres` tourne : `docker compose ps postgres` |
| `cache` | `connected` | `unreachable` | Vérifier Redis : `docker compose ps redis` |
| `rls` | `active` | `disabled` | **Incident sécurité** — voir §4, RLS désactivé sur une table tenant-scoped |
| `storage` | `connected` ou `disabled` | `unreachable` | `disabled` = MinIO non configuré (normal en dev). `unreachable` = MinIO configuré mais injoignable — les uploads (signatures, documents) vont échouer |

Un `503` avec `rls: disabled` doit être traité comme un incident P0 (voir `docs/SECURITY_MODEL.md` si présent, sinon §4 ci-dessous) — ça signifie qu'une table censée être isolée par tenant ne l'est plus.

**Logs** (voir §8) et **métriques Prometheus** (`/metrics/`, protégé par `METRICS_SECRET` en production) donnent une vue plus fine si `/health/ready` seul ne suffit pas à diagnostiquer.

---

## 4. Comment gérer un incident

1. **Confirmer l'ampleur** : `/health/ready` (§3), logs API (§8), Sentry (si configuré — `SENTRY_DSN`).
2. **Isoler** : si un seul tenant est affecté, envisager de le désactiver temporairement (§6) plutôt que d'arrêter toute la plateforme.
3. **Ne jamais** redémarrer la base de production sans backup préalable (voir §2) même en urgence.
4. **Communiquer** : documenter l'heure de début, le symptôme observé, les actions prises — pour le post-mortem.
5. **Post-incident** : si l'incident révèle un bug de sécurité (ex. RLS désactivé, fuite cross-tenant), traiter comme la Phase 1 de `docs/NATIONAL_AUDIT_PHASE0.md` — corriger, ajouter un test qui aurait détecté le problème, documenter.

---

## 5. Comment révoquer un utilisateur

**Révoquer tous les tokens actifs d'un utilisateur** (ex. compte compromis, employé quittant l'établissement) — invalide immédiatement toutes ses sessions sur toutes les routes authentifiées (corrigé et testé Phase 1, voir `backend/tests/test_token_lifecycle.py`) :

```bash
curl -X POST https://api.schoolflow.pro/api/v1/auth/logout-all/ \
  -H "Authorization: Bearer <token de l'utilisateur ou d'un admin agissant pour lui>"
```

**Désactiver le compte complètement** (empêche toute reconnexion future, pas seulement les sessions actuelles) : via l'interface Administration → Utilisateurs, ou directement en base :
```sql
UPDATE users SET is_active = false WHERE email = 'utilisateur@example.com';
```
Un compte désactivé (`is_active = false`) est rejeté dès `/auth/login/` (voir `backend/app/api/v1/endpoints/core/auth.py`, vérification "Check user is active").

---

## 6. Comment désactiver un tenant (établissement)

```bash
curl -X PATCH https://api.schoolflow.pro/api/v1/tenants/{tenant_id}/toggle-status/ \
  -H "Authorization: Bearer <token SUPER_ADMIN>"
```

Un tenant désactivé (`is_active = false`) bloque immédiatement toute nouvelle connexion pour ses utilisateurs (`backend/app/api/v1/endpoints/core/auth.py`, "Verify the user's tenant is active") — les sessions déjà ouvertes restent valides jusqu'à expiration naturelle du token (30 min par défaut) sauf révocation explicite (§5).

---

## 7. Comment diagnostiquer une lenteur

1. **`/health/ready`** (§3) — élimine d'abord une panne franche d'un composant.
2. **Logs structurés** (§8) — chaque ligne de log inclut `request_id`, `tenant_id`, `user_id` et le timing SQLAlchemy quand `echo` est actif ; filtrer par `tenant_id` pour isoler un établissement en particulier.
3. **Métriques Prometheus** (`/metrics/`) — `http_request_duration_seconds` (histogramme par méthode/endpoint) pour repérer quelle route est lente.
4. **Endpoints sans pagination** — si la lenteur concerne une liste, vérifier qu'elle a bien `page_size` borné (audit Phase 3, `backend/app/api/v1/endpoints/operational/*.py` — corrigé pour 18 endpoints, voir commit `fix(perf)`).
5. **Index manquants** — `EXPLAIN ANALYZE` sur la requête suspecte ; comparer avec les index composites déjà posés (migrations `20260424_0001` et `20260724_0001`, tables/colonnes couvertes documentées dans chaque fichier de migration).
6. **File de jobs engorgée** (Phase 5) — si le worker Arq accumule du retard, `docker compose logs worker` montre le débit de traitement ; la table `jobs` (`SELECT status, count(*) FROM jobs GROUP BY status`) montre combien de jobs sont `PENDING`/`RUNNING` depuis longtemps.

---

## 8. Comment vérifier les logs

```bash
docker compose logs -f api                    # Logs API en direct
docker compose logs -f worker                 # Logs worker Arq
docker compose logs --since 1h api | grep '"level": "ERROR"'
```

Les logs sont émis en **JSON structuré** (formateur custom, `backend/app/core/logging_config.py` si présent — sinon voir la config logging de `app/main.py`), avec systématiquement : `request_id` (middleware `app/middlewares/request_id.py`, corrélation d'une requête de bout en bout), `tenant_id`, `user_id`, `timestamp`, `level`, `logger`. Filtrer avec `jq` :
```bash
docker compose logs api | grep '^{' | jq 'select(.level=="ERROR")'
docker compose logs api | grep '^{' | jq --arg tid "<tenant_id>" 'select(.tenant_id==$tid)'
```

Si Sentry est configuré (`SENTRY_DSN` backend, `VITE_SENTRY_DSN` frontend), les exceptions non gérées y apparaissent avec la stack complète et le contexte RGPD-scrubé (headers `Authorization`/`Cookie`/`X-Tenant-ID` retirés — voir `backend/app/main.py`, initialisation Sentry).

---

## Annexe — checklist rapide avant d'escalader un incident

- [ ] `/health/ready` consulté et composants identifiés
- [ ] Logs des dernières 15 minutes filtrés sur `ERROR`
- [ ] Tenant(s) affecté(s) identifié(s) — un seul ou tous ?
- [ ] Backup récent confirmé disponible avant toute action destructive
- [ ] Sentry consulté si configuré
- [ ] Heure de début de l'incident notée pour le post-mortem
