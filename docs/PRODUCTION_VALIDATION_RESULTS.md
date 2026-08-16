# Résultats de validation production — Academy Guinéenne

Ce document consigne la dernière exécution connue des checklists
`docs/RENDER_PRODUCTION_VALIDATION.md` et `docs/WHATSAPP_REAL_VALIDATION.md`.

**Important** : cet environnement de développement (agent IA, poste local)
**n'a pas et n'aura jamais accès** au dashboard Render, à une boîte mail
Gmail/Outlook réelle, ni à un compte Meta Business/numéro WhatsApp réel.
Chaque ligne ci-dessous est donc soit :
- **Vérifié ici** — confirmé automatiquement (tests, build, healthcheck
  Docker local) et reporté honnêtement ;
- **Non vérifiable depuis cet environnement** — nécessite qu'un humain avec
  accès aux consoles Render/Resend/Meta exécute l'étape correspondante et
  mette à jour ce document avec le résultat réel.

Ne jamais interpréter une case "Non vérifiable depuis cet environnement"
comme un échec — c'est une limite d'accès, pas un signal produit.

---

## Dernière exécution

- **Date de validation** : 2026-08-16 (rafraîchissement des items
  vérifiables — voir aussi l'exécution complète du 2026-08-07 pour le
  test du formulaire de contact, non re-rejoué cette fois pour éviter de
  polluer les données réelles du tenant pilote)
- **Commit validé** : `b98c9dbd5a9b87a80d7dd44a2ba2b094facd9fd6`
- **Exécuté par** : agent IA (session autonome), accès navigateur direct
  aux URLs publiques Render (frontend + API) — toujours **aucun accès**
  au dashboard Render, à une boîte mail réelle, ni à un compte Meta
  Business/numéro WhatsApp réel.

## Résultats

| Item | Statut | Détail |
|---|---|---|
| Render API Live | ✅ Vérifié (URL publique, 2026-08-16) | `GET https://schoolflow-api-r8u7.onrender.com/health/live` → `{"status":"alive","version":"1.0.0"}` (cold-start ~1min30 ce jour-là, tier gratuit — plus lent que le ~20s mesuré le 07/08, toujours dans la plage attendue d'un service en veille) |
| Worker Live | 🟡 Vérifié indirectement | Pas d'endpoint de santé public pour le worker Arq. Preuve indirecte : `/health/ready` rapporte `cache: connected` (Redis joignable). Sa *consommation effective* de la file n'a pas été re-testée le 16/08 (voir la soumission réelle du 07/08 ci-dessous pour la dernière preuve directe). |
| Frontend Live | ✅ Vérifié (URL publique, 2026-08-16) | `https://gestion-scolaire-pro-9on3.onrender.com` charge la landing page complète après cold-start — tarifs (Starter/Standard/Premium/Enterprise), annuaire (Université La Source visible), témoignages, RGPD |
| `/health/live` | ✅ Vérifié (Render prod, 2026-08-16) | 200, `{"status":"alive","version":"1.0.0"}` |
| `/health/ready` | ✅ Vérifié (Render prod, 2026-08-16) | 200, `{"status":"healthy","components":{"database":"connected","cache":"connected","rls":"active","storage":"disabled"}}` — identique au 07/08, `storage: disabled` toujours attendu (MinIO non provisionné) |
| Formulaire de contact public (PR #89) | ✅ Vérifié en conditions réelles le 2026-08-07 (non re-rejoué le 16/08) | Page `/uls/pages/contact` : honeypot masqué visuellement confirmé, note de consentement RGPD affichée, soumission réelle → `POST .../submit-form/` → **201**, UI "Message envoyé !" |
| Email Resend test reçu | ⚪ Non vérifiable depuis cet environnement | Nécessite une boîte mail réelle et une clé Resend valide |
| Email onboarding reçu | ⚪ Non vérifiable depuis cet environnement | Idem — dépend de `POST /tenants/create-with-admin/` avec Resend configuré |
| Domaine Resend DKIM/SPF/DMARC | ⚪ Non vérifiable depuis cet environnement | Nécessite le dashboard Resend |
| WhatsApp test envoyé | ⚪ Non vérifiable depuis cet environnement | Nécessite un numéro Meta Business réel |
| Webhook Meta reçu | ⚪ Non vérifiable depuis cet environnement | Nécessite l'abonnement Meta réel — simulé avec succès en local (voir ci-dessous) |
| Message parent entrant visible | 🟡 Simulé avec succès (pas réel) | Payload webhook Meta simulé → persisté → visible dans l'inbox admin, testé en E2E (`tests/e2e/pilot-journey.spec.ts`, test 4) et en unitaire (`tests/test_whatsapp_messages.py`) |
| Réponse école reçue | 🟡 Simulé avec succès (pas réel) | `POST .../reply-whatsapp/` mis en file Arq et testé (`tests/test_whatsapp_reply.py`) — jamais confirmé reçu par un vrai téléphone |
| Statut delivered/read reçu | ⚪ Non vérifiable depuis cet environnement | La logique idempotente (`apply_webhook_status()`) est testée avec des payloads simulés, jamais avec un vrai accusé Meta |

## Ce qui EST vérifié automatiquement à chaque changement (voir Phase 6)

- Suite backend complète (`pytest tests/ -v`) sur Postgres réel.
- `type-check` / `lint` / tests unitaires / `build` frontend.
- Démarrage complet de la stack Docker locale (`api`, `worker`, `frontend`,
  `postgres`, `redis`) et ses healthchecks.
- Scénario E2E Playwright de bout en bout (`pilot-journey.spec.ts`) :
  création tenant, connexion admin, import élève, facturation, webhook
  WhatsApp simulé visible dans l'inbox, déconnexion/reconnexion
  SUPER_ADMIN.

## Problèmes rencontrés (session du 2026-08-16)

- Le cold-start de l'API a pris nettement plus longtemps que d'habitude
  (~1min30 contre ~20s le 07/08) avant de répondre — dans la plage
  attendue d'un service Render tier gratuit resté en veille plus
  longtemps, pas un signal d'incident (une fois réveillé, `/health/ready`
  reste sain).
- Aucun autre blocage nouveau détecté sur les items vérifiables depuis cet
  environnement.
- Rappel des limites déjà documentées ailleurs : aucun template Meta n'est
  encore créé/approuvé (voir `docs/WHATSAPP_NOTIFICATIONS.md`), donc un
  envoi proactif réel (rappel de paiement, alerte d'absence) hors fenêtre
  24h échouera tant que ce n'est pas fait côté Meta Business Manager.

## Captures ou logs utiles

Aucune capture d'écran possible depuis cet environnement (pas d'interface
Render/Meta accessible). Les logs de la dernière suite de tests complète
sont disponibles dans l'historique de la session ayant produit ce commit ;
non joints ici pour éviter un fichier obsolète dès le prochain run.

## Comment mettre à jour ce document

Après avoir exécuté manuellement les checklists réelles
(`docs/RENDER_PRODUCTION_VALIDATION.md` et
`docs/WHATSAPP_REAL_VALIDATION.md`) avec un accès réel à Render/Resend/Meta,
remplacer les lignes ⚪ ci-dessus par ✅ ou ❌ selon le résultat réel observé,
mettre à jour la date et le commit, et committer ce fichier.
