# Validation WhatsApp Cloud API réelle — checklist manuelle

**Statut** : checklist actionnable, pas un rapport de résultats. Un agent IA n'a
pas de compte Meta Business/WhatsApp Cloud API réel ni de numéro de test — chaque
étape ci-dessous nécessite un humain avec accès au Meta Business Manager
(https://business.facebook.com) du tenant concerné et à un téléphone WhatsApp réel
pour recevoir/envoyer les messages de test.

Prérequis déjà en place côté code (validé par tests automatisés, voir section finale) :
- Webhook signature obligatoire en production (`app/api/v1/endpoints/core/whatsapp_webhook.py`)
- Persistance des messages entrants (`message_threads`/`message_items`)
- Réponse école→parent via `reply-whatsapp` + job Arq
- Écran admin des conversations (`/admin/messages` → onglet WhatsApp)

## 1. Configuration Meta Business Manager

Pour l'établissement de test :

- [ ] Un numéro WhatsApp Business est actif et vérifié dans Meta Business Manager
- [ ] `whatsappPhoneId`, `whatsappAccessToken`, `whatsappAppSecret` sont renseignés
      dans les paramètres WhatsApp de ce tenant (`/admin/settings` → section WhatsApp)
- [ ] Le webhook de l'app Meta pointe vers :
      `https://schoolflow-api.onrender.com/api/v1/whatsapp/webhook/`
- [ ] Le champ **Verify Token** configuré côté Meta correspond exactement à celui
      stocké côté tenant (`whatsappVerifyToken`)
- [ ] L'abonnement webhook inclut le champ `messages` (sinon aucun message entrant
      ni statut de livraison n'arrive jamais)

## 2. Handshake GET webhook (vérification Meta)

Dans Meta Business Manager, le bouton "Vérifier et enregistrer" du webhook déclenche
un `GET` avec `hub.mode=subscribe`. Pour le tester manuellement :

```bash
curl -i "https://schoolflow-api.onrender.com/api/v1/whatsapp/webhook/?hub.mode=subscribe&hub.verify_token=<le_vrai_token>&hub.challenge=123456"
```

- [ ] Réponse `200`, corps = `123456` (echo exact du challenge)
- [ ] Avec un `hub.verify_token` volontairement faux → `403`

## 3. Signature webhook en production

Le code (`whatsapp_webhook.py`, corrigé dans cette session) exige désormais en
production : app secret configuré + signature `X-Hub-Signature-256` valide.

- [ ] Requête `POST` **sans** header de signature → `403`
- [ ] Requête `POST` avec une signature **invalide** (mauvais secret) → `403`
- [ ] Un vrai événement envoyé par Meta (signature valide, générée avec le bon
      `whatsappAppSecret`) → `200`

Ces 3 comportements sont déjà couverts par des tests automatisés
(`backend/tests/test_whatsapp_webhook.py::TestProductionSignatureEnforcement`,
17/17 passants) — ce point de la checklist consiste à confirmer qu'un vrai
appel Meta en production se comporte pareil, pas à re-tester la logique elle-même.

## 4. Envoi sortant réel

Depuis `/admin/settings` (section WhatsApp) → bouton "Tester WhatsApp", ou via l'API :

```bash
curl -X POST https://schoolflow-api.onrender.com/api/v1/notifications/whatsapp/test/ \
  -H "Authorization: Bearer <token TENANT_ADMIN>" \
  -H "X-Tenant-ID: <tenant_id>" \
  -H "Content-Type: application/json" \
  -d '{"to_phone": "+224XXXXXXXXX"}'
```

- [ ] Réponse `200 {"sent": true, ...}`
- [ ] Message reçu sur le téléphone WhatsApp réel sous 30 secondes
- [ ] Le message apparaît dans `notification_events` avec `status=SENT` puis,
      une fois lu par le destinataire, passe à `DELIVERED`/`READ` via webhook
      (vérifiable via `GET /platform/tenants/{id}/integrations-health/` →
      `last_successful_whatsapp_test_at`)

## 5. Rappel de paiement réel

- [ ] Créer une facture réelle en retard pour un élève test avec un parent ayant
      un vrai numéro WhatsApp
- [ ] Déclencher l'envoi des rappels (`POST /payments/send-reminders/`)
- [ ] Message de rappel reçu sur le téléphone du parent test
- [ ] `notification_events` contient une ligne `event_type=payment_reminder`,
      `status=SENT`

## 6. Statuts de livraison (delivered/read)

- [ ] Après réception du message de test (point 4), ouvrir WhatsApp sur le
      téléphone destinataire (déclenche le statut `read` côté Meta)
- [ ] Webhook reçu par `schoolflow-api` (vérifiable dans les logs Render, ou via
      `GET /platform/webhooks/recent-failures/` qui liste les échecs — l'absence
      de nouvelle entrée ici est un signal positif)
- [ ] Statut de l'événement passe bien à `READ` (pas bloqué à `SENT`/`QUEUED` —
      voir `whatsapp_stuck_count` dans `integrations-health/`)

## 7. Message entrant réel d'un parent

- [ ] Depuis le téléphone WhatsApp test (jouant le rôle du parent), envoyer un
      message texte libre au numéro Business de l'établissement
- [ ] Le message apparaît dans `/admin/messages` → onglet WhatsApp, sous 1 minute
- [ ] Si le numéro correspond à un parent existant dans SchoolFlow → nom du parent
      affiché ; sinon → conversation "Numéro inconnu" mais message quand même visible
      (jamais silencieusement perdu)
- [ ] Envoyer un second message depuis le même numéro → il apparaît dans la
      **même** conversation (thread réutilisé, pas dupliqué)

## 8. Message d'un type non-texte (image/audio/document)

- [ ] Envoyer une image ou un vocal depuis le téléphone test
- [ ] Le message apparaît dans la conversation avec un texte de substitution
      (ex. `[message image reçu — non affichable ici]`) — comportement volontaire,
      SchoolFlow ne stocke jamais les médias WhatsApp bruts

## 9. Réponse école → parent réelle

Depuis `/admin/messages` → onglet WhatsApp → sélectionner la conversation créée
au point 7 → écrire une réponse → Envoyer.

- [ ] Le message apparaît immédiatement côté admin avec le statut "en cours"
- [ ] Le message arrive réellement sur le téléphone WhatsApp du parent test sous
      30 secondes
- [ ] Le statut côté admin passe de "en cours" à "envoyé" (webhook de confirmation
      reçu)

## 10. Signature invalide en conditions réelles

- [ ] Depuis un poste externe, envoyer un `POST` forgé vers l'URL du webhook avec
      un corps JSON arbitraire et un header `X-Hub-Signature-256` incorrect →
      confirmer `403` (pas de traitement, pas de 500)

---

## Ce qui a été validé automatiquement (session IA, sans compte Meta réel)

Tout le pipeline webhook a été testé de bout en bout avec un **webhook simulé**
(payload JSON construit à la main, envoyé en HTTP direct à l'API locale — jamais
un vrai appel Meta) :
- Persistance d'un message entrant simulé → `message_threads`/`message_items` (vérifié
  en base Postgres réelle)
- Apparition dans l'écran admin `/admin/messages` → WhatsApp (vérifié dans un
  navigateur réel, build de production Docker)
- Réponse école→parent via l'écran → `202 Accepted` → job Arq exécuté (confirmé
  dans les logs du worker) → statut final `FAILED` (attendu : pas de vrai token
  Meta configuré dans cet environnement de test)
- Suite de tests automatisés : `test_whatsapp_webhook.py` (17/17),
  `test_whatsapp_messages.py` (7/7), `test_whatsapp_reply.py` (y compris
  idempotence), `test_whatsapp_threads_list.py` (5/5)

Ce que ces tests ne prouvent **pas** : que Meta accepte réellement la configuration
(app secret, verify token, abonnement webhook), qu'un vrai téléphone reçoit les
messages, et que la latence réelle du réseau Meta est acceptable. Seule la
checklist ci-dessus, exécutée manuellement, le confirme.
