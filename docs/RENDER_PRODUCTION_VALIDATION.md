# Validation production Render + Resend — checklist manuelle

**Statut** : ce document est une checklist actionnable, pas un rapport de résultats.
Un agent IA n'a pas accès au dashboard Render ni aux boîtes mail réelles (Gmail/Outlook) —
chaque étape ci-dessous doit être exécutée manuellement par un humain ayant accès au
dashboard Render (https://dashboard.render.com) et aux identifiants de ce déploiement.

Services concernés (voir `render.yaml`) :
- `schoolflow-api` (web) — backend FastAPI
- `schoolflow-worker` (worker) — Arq/Redis background jobs
- `gestion-scolaire-pro` (web) — frontend statique (nginx)
- `schoolflow-redis` (Redis) — file de jobs + cache

## 1. Démarrage des services

Dans le dashboard Render, pour chacun des 3 services (`schoolflow-api`,
`schoolflow-worker`, `gestion-scolaire-pro`) :

- [ ] Statut = **Live** (pas *Deploy failed*, pas *Suspended*)
- [ ] Dernier déploiement correspond au commit attendu sur `main`
- [ ] Aucune boucle de redémarrage dans les logs (`Deploy` → `Logs`)

```bash
# Depuis un poste avec accès réseau au déploiement (remplacer l'URL par
# celle réelle du service schoolflow-api sur Render) :
curl -i https://schoolflow-api.onrender.com/health/live
curl -i https://schoolflow-api.onrender.com/health/ready
```

Résultat attendu :
- `/health/live` → `200 OK`, réponse immédiate (ne dépend d'aucune ressource externe)
- `/health/ready` → `200 OK` seulement si Postgres (Neon) + Redis sont joignables ;
  un `503` ici indique une régression de connectivité, pas juste un service lent

## 2. Redis

- [ ] Dashboard Render → `schoolflow-redis` → statut **Available**
- [ ] `schoolflow-worker` → onglet Logs → confirmer la ligne de connexion Arq
      au démarrage (`Starting worker for...` sans erreur de connexion juste après)

## 3. Neon (PostgreSQL)

- [ ] Dashboard Neon → projet du déploiement → statut de la branche `main` = **Active**
- [ ] `schoolflow-api` → Logs → au démarrage, confirmer l'absence d'erreur
      `could not connect to server` ou de timeout Alembic

## 4. Migrations Alembic

Les migrations s'appliquent automatiquement au démarrage de `schoolflow-api`
(voir `backend/start.sh` / `Dockerfile.dev`). Vérifier dans les logs du dernier
déploiement :

- [ ] Ligne `Running upgrade ... -> ..., <description>` pour chaque migration
      en attente (pas d'erreur `Multiple heads`, pas de `sqlalchemy.exc.*`)
- [ ] Aucune migration bloquée en cours (le service passe bien à *Live* après)

En local, la même vérification s'exécute avec :

```bash
cd backend
python -m alembic heads      # doit renvoyer UNE seule tête
python -m alembic current    # doit correspondre à la tête ci-dessus une fois déployé
```

## 5. Endpoints de santé applicatifs

```bash
curl -i https://schoolflow-api.onrender.com/health/live
curl -i https://schoolflow-api.onrender.com/health/ready
curl -i https://schoolflow-api.onrender.com/api/v1/platform/email/health/ \
  -H "Authorization: Bearer <token SUPER_ADMIN valide>"
```

- [ ] `/health/live` → 200
- [ ] `/health/ready` → 200 (DB + Redis OK)
- [ ] `/platform/email/health/` → 200, avec dans le corps :
  - `"resend_configured": true`
  - `"from_email_domain": "datasphere-innovation.net"`
  - `"frontend_url_has_https": true`

## 6. Variables d'environnement critiques

Dashboard Render → `schoolflow-api` → Environment :

- [ ] `FRONTEND_URL` commence bien par `https://` (jamais `http://` en prod)
- [ ] `FROM_EMAIL` = `noreply@datasphere-innovation.net` (domaine vérifié Resend —
      voir point 7)
- [ ] `SECRET_KEY` fait au moins 32 caractères et n'est **jamais** affiché dans
      les logs (grep rapide sur les derniers logs pour confirmer qu'aucune ligne
      ne contient `SECRET_KEY=`)
- [ ] `ENFORCE_MFA` reste à `false` tant que le SUPER_ADMIN n'a pas activé la MFA
      (décision explicite prise plus tôt dans le projet — voir mémoire de session)
- [ ] `DATABASE_URL` pointe vers l'instance Neon de production, pas un test/staging

## 7. Domaine Resend vérifié

- [ ] Dashboard Resend (https://resend.com/domains) → `datasphere-innovation.net`
      a le statut **Verified** (DKIM + SPF + DMARC tous verts)
- [ ] Aucun email de test récent en statut `Bounced` ou `Complained` pour ce domaine

## 8. Email réel — test de bout en bout

Depuis l'app en tant que SUPER_ADMIN (dashboard `/super-admin`), ou via curl :

```bash
curl -X POST https://schoolflow-api.onrender.com/api/v1/platform/email/test-send/ \
  -H "Authorization: Bearer <token SUPER_ADMIN>" \
  -H "Content-Type: application/json" \
  -d '{"to_email": "<votre-adresse-gmail-ou-outlook-reelle>"}'
```

- [ ] Réponse `200 {"sent": true, ...}`
- [ ] Email reçu dans la boîte de réception (pas seulement dans les spams) sous
      2 minutes
- [ ] L'expéditeur affiché est bien `noreply@datasphere-innovation.net`
- [ ] Aucun avertissement "expéditeur non vérifié" affiché par Gmail/Outlook

## 9. Email d'onboarding réel

- [ ] Créer un nouvel établissement de test via `/inscription` (parcours public réel,
      pas un appel API direct) avec une vraie adresse email accessible
- [ ] Email de bienvenue reçu (`send_welcome_email` via Arq — vérifier dans les logs
      `schoolflow-worker` que le job `send_welcome_email` est passé en `SUCCESS`)
- [ ] Le lien "Configurer mon établissement" dans l'email ouvre bien
      `https://<frontend>/<slug-du-nouveau-tenant>/admin/onboarding` — vérifier que
      le slug correspond exactement au tenant créé, pas un autre

## 10. Nettoyage après validation

- [ ] Supprimer/désactiver le tenant de test créé au point 9 s'il ne doit pas
      rester en production (ne jamais le faire sur un tenant réel d'un client)

---

## Ce qui a été validé automatiquement (session IA, sans accès Render)

Pour situer cette checklist par rapport au travail déjà fait sans accès production :
- Les mêmes endpoints (`/health/live`, `/health/ready`, `/platform/email/health/`,
  `/platform/email/test-send/`) ont un test automatisé en local contre Postgres réel
  (voir `backend/tests/test_email_health.py`, `test_platform_tenant_health.py`)
- Le build Docker de production (`docker compose build frontend api worker`) a été
  vérifié sans erreur et démarré avec succès en local — c'est la meilleure
  approximation possible de ce que Render construit, sans être Render lui-même
- Aucun de ces tests locaux ne remplace un vrai test contre les services Render/Resend
  réels : ils prouvent que le code fonctionne, pas que la configuration de
  production (secrets, domaine Resend, DNS) est correcte
