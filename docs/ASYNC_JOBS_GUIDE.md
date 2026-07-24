# Guide — jobs asynchrones (Arq)

**Contexte** : audit national Phase 5. Avant ce travail, le seul mécanisme de traitement différé était `BackgroundTasks` de FastAPI — en mémoire du process, perdu au redémarrage du conteneur ou si vous avez plusieurs répliques de l'API. Pour des traitements lourds à l'échelle nationale (génération de bulletins en masse, imports Excel, SMS/email, rapports ministère), il faut une file persistante.

Ce guide décrit l'infrastructure posée et **comment migrer une nouvelle tâche** — il ne migre volontairement **qu'une seule tâche** (l'email de bienvenue à l'inscription) comme preuve de fonctionnement, pas toutes les tâches lourdes du produit d'un coup.

## Architecture

- **File** : Arq, adossée à Redis (la même instance que le reste de l'app — `settings.REDIS_URL`).
- **`app/core/jobs.py`** : `enqueue_job(function_name, *args, **kwargs)` — échoue toujours "ouvert" (ne lève jamais, retourne `None` si Redis est injoignable), pour rester cohérent avec toutes les autres fonctionnalités Redis-optionnelles du projet (blacklist token, lockout, limite de sessions...).
- **`app/workers/tasks.py`** : les fonctions de tâche elles-mêmes (`async def ma_tache(ctx, ...)`), et `WorkerSettings` qui les enregistre.
- **Table `jobs`** (migration `20260724_0002`) : statut visible (`PENDING/RUNNING/SUCCESS/FAILED`), payload, résultat, erreur, horodatages. `tenant_id` nullable (certains jobs futurs seront transverses, ex. un export ministère).
- **Service Docker `worker`** : même image que `api`, exécute `python -m arq app.workers.tasks.WorkerSettings` au lieu du serveur HTTP. N'expose aucun port. Si ce conteneur est arrêté, l'API continue de fonctionner — elle retombe simplement sur l'ancien chemin `BackgroundTasks` pour les tâches migrées (voir plus bas).

## Le pattern "enqueue avec repli"

Chaque appelant doit avoir un filet de sécurité si la file est indisponible. Exemple réel (`app/api/v1/endpoints/core/auth.py`, inscription d'un établissement) :

```python
job_id = await enqueue_job(
    "send_welcome_email",
    tenant_id=str(tenant.id),
    to_email=body.email,
    first_name=body.first_name,
    school_name=body.school_name,
    slug=slug,
)
if job_id is None:
    # Redis injoignable — retombe sur l'ancien BackgroundTasks in-process.
    background_tasks.add_task(_send_welcome_email_background, ...)
```

**Règle absolue** : un chemin critique (ici, l'inscription) ne doit **jamais** échouer parce que la file est indisponible.

## Ajouter une nouvelle tâche

1. Écrire la fonction dans `app/workers/tasks.py` :
   ```python
   async def generer_bulletin_masse(ctx: dict, *, tenant_id: str, classe_id: str) -> dict:
       job_id = _job_started("generer_bulletin_masse", tenant_id, {"classe_id": classe_id})
       try:
           # ... logique métier ...
           _job_finished(job_id, success=True, result={"count": n})
           return {"job_id": job_id}
       except Exception as exc:
           _job_finished(job_id, success=False, error=str(exc))
           raise  # laisse Arq retenter selon max_tries
   ```
2. L'ajouter à `WorkerSettings.functions` dans le même fichier.
3. Depuis l'endpoint : `job_id = await enqueue_job("generer_bulletin_masse", tenant_id=..., classe_id=...)`, avec un filet de sécurité si `job_id is None` (dégrader gracieusement plutôt que planter — synchrone en dernier recours si l'opération est critique, ou renvoyer un message "réessayez plus tard" si elle ne l'est pas).
4. Tester : voir `backend/tests/test_async_jobs.py` pour le pattern (échec ouvert + succès de bout en bout).

## Lancer le worker en local (hors Docker)

```bash
cd backend
python -m arq app.workers.tasks.WorkerSettings
# ou en mode "traite ce qui est en file puis s'arrête" (utile en test) :
python -m arq app.workers.tasks.WorkerSettings --burst
```

## Ce qui n'est PAS fait dans cette passe

Volontairement laissé pour des PR dédiées ultérieures (voir `docs/NATIONAL_AUDIT_PHASE0.md`, Phase 5) :
- Migration des exports Excel/PDF, imports CSV, rapports ministère, relances de paiement.
- Génération de bulletins PDF côté serveur (actuellement uniquement côté navigateur — voir P1-1 de l'audit).
- Dashboard de supervision des jobs dans l'interface admin (aujourd'hui, la table `jobs` est consultable en base uniquement).
- Notifications de fin de traitement (email/push quand un job long se termine).
