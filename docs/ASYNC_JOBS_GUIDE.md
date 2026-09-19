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

## Le pattern "polling" (quand l'appelant a besoin du résultat)

Les tâches ci-dessus (email, WhatsApp, relances) sont "fire-and-forget" —
l'appelant n'a pas besoin de savoir quand elles se terminent. Un import
CSV est différent : la personne qui a lancé l'import veut voir "142
élèves importés, 3 lignes en erreur" dans l'interface. Pattern retenu
(voir `import_students_job` dans `app/workers/tasks.py` et
`confirm_student_import`/`get_import_job_status` dans
`app/api/v1/endpoints/core/imports.py`) :

1. L'endpoint crée la ligne `jobs` **lui-même**, via `_job_started(...)`,
   *avant* d'enfiler la tâche — pour pouvoir renvoyer `job_id` tout de
   suite, avant même que le worker ait pu s'en saisir.
2. Il enfile la tâche en lui passant ce `job_id` déjà créé.
3. La tâche ne rappelle PAS `_job_started()` (elle recréerait une seconde
   ligne) — elle traite, puis appelle `_job_finished(job_id, ...)` sur la
   ligne existante.
4. Si `enqueue_job()` échoue (Redis injoignable), l'endpoint exécute la
   même logique **de façon synchrone**, dans la requête, avec le même
   `job_id` — et renvoie quand même `{"job_id": ...}`. Le premier appel du
   frontend à `GET /import/jobs/{job_id}/` verra alors directement le
   statut final (`SUCCESS`/`FAILED`), sans jamais avoir eu besoin de
   savoir si la file était disponible ou non.
5. Un nouvel endpoint `GET /.../jobs/{job_id}/` renvoie `{status, result,
   error, ...}`, scopé au tenant de l'appelant (404 si le job appartient à
   un autre établissement).
6. Le frontend poll cet endpoint toutes les ~1s jusqu'à `SUCCESS`/`FAILED`.

**Ne jamais laisser Arq retenter ce genre de tâche** : un import CSV
partiellement traité qui repart de zéro va dupliquer les lignes sans
matricule fourni (un nouveau matricule est généré à chaque tentative). La
tâche attrape ses propres exceptions, appelle `_job_finished(..., success=False)`
et **ne relance pas** l'exception — contrairement à l'exemple `raise` du
paragraphe précédent, qui convient aux tâches idempotentes (un envoi
d'email raté peut sans risque être retenté).

## Lancer le worker en local (hors Docker)

```bash
cd backend
python -m arq app.workers.tasks.WorkerSettings
# ou en mode "traite ce qui est en file puis s'arrête" (utile en test) :
python -m arq app.workers.tasks.WorkerSettings --burst
```

## Ce qui n'est PAS fait dans cette passe

Volontairement laissé pour des PR dédiées ultérieures (voir `docs/NATIONAL_AUDIT_PHASE0.md`, Phase 5) :
- **Fait (national-readiness audit, 2026-09, priorité 5)** : import CSV élèves (`confirm_student_import`) — premier exemple du pattern polling ci-dessus.
- **Fait (national-readiness audit, 2026-09)** : import CSV parents (`confirm_parent_import`) et enseignants (`confirm_teacher_import`) — même pattern polling, logique extraite dans `app/services/parent_import.py` / `app/services/teacher_import.py`, tâches `import_parents_job`/`import_teachers_job` dans `app/workers/tasks.py`. Le frontend (`DataImport.tsx`) n'a pour l'instant de page d'import que pour les élèves — parents/enseignants sont utilisables via l'API mais n'ont pas encore d'écran dédié.
- **Fait (national-readiness audit, 2026-09)** : génération groupée de bulletins (`POST /school-life/generate-report-cards/batch/`) — dernier endpoint synchrone du P0-2 initial. Logique extraite dans `_generate_batch_report_cards` (`school_life.py`), tâche `generate_report_cards_batch_job`. Contrairement aux imports, c'est un traitement lecture seule (aucune écriture DB) — un retry n'a aucun risque de duplication, mais le job échoue quand même une fois plutôt que de laisser Arq retenter aveuglément un calcul déjà coûteux. Polling via un nouvel endpoint `GET /school-life/jobs/{job_id}/` (permission `grades:write`, distinct du `GET /import/jobs/{job_id}/` des imports qui exige `students:write`).
- Exports Excel/PDF, rapports ministère — même pattern, pas encore appliqué.
- Génération de bulletins PDF côté serveur — un vrai fichier PDF existe maintenant (`generate-report-card/pdf/`, WeasyPrint), mais la génération elle-même reste synchrone dans la requête ; la génération en masse (`generate-report-cards/batch/`) l'est aussi.
- Dashboard de supervision des jobs dans l'interface admin (aujourd'hui, la table `jobs` est consultable en base, ou via `GET /import/jobs/{job_id}/` pour un job précis).
- Notifications de fin de traitement (email/push quand un job long se termine).
