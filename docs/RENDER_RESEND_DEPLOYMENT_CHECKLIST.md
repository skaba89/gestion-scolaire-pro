# Checklist de déploiement — Render + Resend (emails transactionnels)

Ce document couvre uniquement la fiabilité des emails transactionnels
(inscription école, reset mot de passe, invitations) sur le déploiement
Render de Academy Guinéenne. Pour le reste du déploiement, voir `render.yaml`
et `docs/COMMERCIAL_READINESS.md`.

## 1. Variables Render — `schoolflow-api` (backend)

| Variable | Obligatoire | Notes |
|---|---|---|
| `DATABASE_URL`, `DATABASE_URL_SYNC`, `DATABASE_URL_ASYNC` | Oui | Chaîne Neon **pooled** (`-pooler` dans le hostname) |
| `SECRET_KEY` | Oui | Auto-généré par le blueprint, ≥32 caractères |
| `ENVIRONMENT` | Recommandé | `production` — active la vérification stricte de `SECRET_KEY` |
| `DEBUG` | Oui | `false` |
| `BACKEND_CORS_ORIGINS` | Oui | Résolu automatiquement vers le hostname du frontend |
| `FRONTEND_URL` | Oui | **URL complète avec `https://`** — sinon les liens email sont cassés (bug vécu en production sur ce projet, voir §10) |
| `RESEND_API_KEY` | Oui (ou SMTP) | À définir manuellement dans le dashboard Render (`sync: false`) |
| `FROM_EMAIL` | Oui | Doit être sur un **domaine vérifié Resend** (voir §4) |
| `FROM_NAME` | Recommandé | Nom affiché comme expéditeur |
| `SMTP_HOST/PORT/USER/PASS` | Optionnel | Fallback si Resend échoue — laisser vide pour Resend seul |
| `REDIS_URL` | Oui | Résolu automatiquement depuis `schoolflow-redis` |
| `METRICS_SECRET` | Oui | Auto-généré |

## 2. Variables Render — `gestion-scolaire-pro` (frontend)

| Variable | Obligatoire | Notes |
|---|---|---|
| `NODE_ENV` | Oui | `production` |
| `VITE_API_URL` | Oui | Résolu automatiquement vers le hostname du backend |

Le frontend n'envoie aucun email directement — rien de spécifique à Resend
ici, mais `FRONTEND_URL` côté backend doit correspondre à l'URL réelle de
ce service (ou à un domaine personnalisé pointant dessus).

## 3. Variables Render — `schoolflow-worker` (Arq, nouveau)

Sans ce service, les jobs empilés par `enqueue_job()` (ex: email de
bienvenue) ne sont **jamais consommés** — ils restent en `RUNNING` dans la
table `jobs` indéfiniment, sans erreur visible côté inscription (qui
réussit quand même).

| Variable | Obligatoire | Notes |
|---|---|---|
| `DATABASE_URL`, `DATABASE_URL_SYNC`, `DATABASE_URL_ASYNC` | Oui | Même valeurs que `schoolflow-api` |
| `SECRET_KEY` | Oui | **Même valeur** que `schoolflow-api` (copier depuis son onglet Environment) |
| `ENVIRONMENT` | Oui | `production` |
| `REDIS_URL` | Oui | Résolu automatiquement (même Redis que l'API) |
| `FRONTEND_URL`, `RESEND_API_KEY`, `FROM_EMAIL`, `FROM_NAME`, `SMTP_*` | Oui | Mêmes valeurs que `schoolflow-api` — le worker construit et envoie l'email lui-même |

Après déploiement, vérifiez dans les logs Render du service
`schoolflow-worker` une ligne du type `Starting worker for 1 functions`
(Arq) — son absence signifie que le worker n'a pas démarré.

## 4. DNS Resend (SPF / DKIM / DMARC)

1. Dans le dashboard Resend → **Domains** → ajoutez votre domaine.
2. Ajoutez les enregistrements DNS fournis (chez votre registrar/hébergeur DNS) :
   - **TXT** `resend._domainkey` — clé DKIM
   - **MX** `send` → `feedback-smtp.<region>.amazonses.com` (priorité 10)
   - **TXT** `send` → `v=spf1 include:amazonses.com ~all`
   - **TXT** `_dmarc` → `v=DMARC1; p=none;` (ou `p=quarantine` si vous avez déjà une politique DMARC)
3. ⚠️ Utilisez le type **TXT** brut pour le SPF, **pas** un type spécialisé
   "SPF" fourni par certains panels DNS (LWS, etc.) — ces assistants
   ajoutent parfois des caractères qui invalident la valeur attendue par
   Resend.
4. Attendez 15-30 min de propagation, puis cliquez **"Verify DNS Records"**
   sur Resend.
5. Une fois vérifié, `FROM_EMAIL` doit être une adresse sur ce domaine
   (ex: `noreply@votredomaine.com`), pas `noreply@schoolflow.pro` (placeholder
   du blueprint, non vérifié par défaut).

## 5. Vérification domaine Resend

- `GET /api/v1/platform/email/health/` (SUPER_ADMIN) confirme la config
  applicative, **mais ne interroge pas Resend lui-même** — la vérification
  DNS reste à faire sur resend.com/domains.
- Statut "Verified" (vert) requis sur les 3 enregistrements avant tout test
  d'envoi réel.

## 6. Test email inscription école

1. `POST /api/v1/auth/register-school/` avec un email réel que vous
   contrôlez.
2. Vérifiez la boîte de réception (et les spams) dans les 1-2 minutes.
3. Si rien n'arrive après 5 min : voir §10 "Procédure si email non reçu".
4. Vérifiez aussi la table `jobs` (ou via un futur endpoint admin) que le
   job `send_welcome_email` est passé à `SUCCESS`, pas resté `RUNNING`
   (worker down) ni `FAILED` (provider en échec).

## 7. Test email reset password

`POST /api/v1/auth/forgot-password/` avec un email d'un compte existant —
même vérification (boîte de réception + spams).

## 8. Test Resend dashboard logs

Sur resend.com/emails, chaque envoi apparaît avec un statut
(`Delivered`/`Bounced`/`Failed`) et le détail de l'erreur le cas échéant —
c'est la source de vérité la plus fiable, plus fiable que "l'email n'est
pas arrivé" côté utilisateur (qui peut être un problème de spam, pas
d'envoi).

## 9. Test lien onboarding

Ouvrez le lien "Configurer mon établissement" reçu par email — il doit
mener à `{FRONTEND_URL}/{slug}/admin/onboarding` sur le **vrai** domaine
du frontend, jamais sur `localhost`. `GET /api/v1/platform/email/health/`
→ `frontend_url_has_https: true` doit être vérifié avant tout envoi en
production.

## 10. Procédure si email non reçu

1. Vérifier `GET /api/v1/platform/email/health/` → `resend_configured`,
   `smtp_configured`, `frontend_url_has_https` tous corrects.
2. Vérifier resend.com/emails pour le dernier envoi — statut et raison
   d'échec exacte.
3. Si `Bounced` avec "domain not verified" ou "you can only send testing
   emails to your own address" → domaine Resend non vérifié, l'API tourne
   en mode sandbox (voir §4).
4. Si aucune trace sur Resend du tout → le job n'est probablement jamais
   parti : vérifier que `schoolflow-worker` est bien "Live" sur Render, et
   consulter ses logs pour une erreur au démarrage (souvent `SECRET_KEY`
   manquant ou trop court, ou `REDIS_URL` injoignable).
5. Utiliser `POST /api/v1/platform/email/test-send/` (SUPER_ADMIN) pour un
   envoi isolé, sans repasser par toute l'inscription.

## 11. Procédure Gmail spam

- Gmail traite plus sévèrement les nouveaux domaines d'envoi sans
  historique de réputation — normal les premiers jours.
- Vérifier que DKIM ET SPF sont bien "Aligned" (alignement du domaine
  `From:` avec le domaine signant), pas seulement "présents".
- Éviter les mots déclencheurs de spam dans le sujet ("Gratuit",
  "Urgent", excès de majuscules/emoji).
- Un DMARC à `p=none` n'améliore pas la délivrabilité par lui-même — c'est
  surtout un outil de reporting ; passer à `p=quarantine` une fois la
  réputation établie améliore la confiance des filtres.

## 12. Procédure rotation `RESEND_API_KEY`

1. Créer une nouvelle clé API sur resend.com/api-keys (ne pas révoquer
   l'ancienne tout de suite).
2. Mettre à jour `RESEND_API_KEY` dans Render → `schoolflow-api` **et**
   `schoolflow-worker` (les deux services l'utilisent indépendamment).
3. Redéployer les deux services (ou attendre le prochain restart —
   `RESEND_API_KEY` est lu au démarrage via `Settings`, pas rechargé à
   chaud).
4. Vérifier `POST /api/v1/platform/email/test-send/` avec la nouvelle clé
   avant de révoquer l'ancienne sur resend.com.
5. Révoquer l'ancienne clé.

## 13. Checklist avant pilote payant

- [ ] Domaine Resend vérifié (SPF + DKIM + DMARC tous "Verified")
- [ ] `FROM_EMAIL` sur le domaine vérifié, pas le placeholder `schoolflow.pro`
- [ ] `FRONTEND_URL` = URL HTTPS réelle du frontend en production
- [ ] `schoolflow-worker` déployé et "Live" sur Render
- [ ] Email d'inscription testé de bout en bout (réception + lien fonctionnel)
- [ ] Email de reset password testé de bout en bout
- [ ] `GET /api/v1/platform/email/health/` renvoie tous les booléens à `true`
      (sauf `smtp_configured` si vous n'utilisez que Resend, ce qui est
      normal et acceptable)
- [ ] Aucun email de test n'est resté bloqué en `RUNNING` dans la table `jobs`
- [ ] `RESEND_API_KEY` n'apparaît dans aucun log Render ni dans le dépôt Git

## 14. Proposition — webhooks Resend (Phase 7, non implémenté)

Objectif : suivre `email.sent`, `email.delivered`, `email.bounced`,
`email.failed`, `email.complained` au lieu de se fier uniquement au
dashboard Resend.

Si implémenté :

- Endpoint public `POST /api/v1/webhooks/resend/`, protégé exclusivement
  par la vérification de signature Resend (svix — Resend signe ses
  webhooks avec ce format), jamais par JWT.
- Nouvelle table `email_events` : `id`, `provider_event_id` (unique),
  `event_type`, `status`, `recipient_masked` (ex: `d***@ecole.gn`, jamais
  l'email complet en clair), `reason` (raison de bounce le cas échéant),
  `created_at`. **Ne jamais stocker le contenu de l'email.**
  `provider_event_id` unique empêche un double traitement si Resend
  renvoie le même événement deux fois (comportement standard des webhooks).
- Endpoint support (SUPER_ADMIN) `GET /platform/email/last-bounce/{user_id}/`
  pour diagnostiquer rapidement un utilisateur qui se plaint de ne rien
  recevoir, sans avoir à ouvrir le dashboard Resend.
- Non prioritaire tant que le volume d'envoi reste faible (dashboard Resend
  suffit en usage manuel) — à réévaluer une fois plusieurs dizaines
  d'inscriptions/jour.
