# WhatsApp Cloud API — SchoolFlow Pro

## État du chantier

**Étape 1 (livrée)** : modèle de données (`notification_events`), service
d'orchestration (`whatsapp_service.py`), jobs Arq. Testé.

**Étape 2 (livrée)** : endpoint webhook `GET/POST /api/v1/whatsapp/webhook/`
— validation Meta, réception des statuts (idempotente), vérification de
signature HMAC-SHA256 (`X-Hub-Signature-256`).
**En production/staging (`ENVIRONMENT=production|staging`), la signature
est obligatoire** : un tenant résolu sans `whatsappAppSecret` configuré, ou
une requête sans en-tête `X-Hub-Signature-256` valide, est rejetée avec un
403 — voir `app/api/v1/endpoints/core/whatsapp_webhook.py::_is_production()`.
Hors production (dev/CI), un secret absent est encore accepté mais loggé
bruyamment en WARNING, pour ne jamais s'appuyer dessus silencieusement.
Testé.

**Étape 3 (livrée)** : `GET/PATCH /api/v1/notifications/settings/` et
`POST /api/v1/notifications/whatsapp/test/` — configuration et test réel par
tenant, sans jamais exposer de secret. Interface admin livrée
(`src/components/settings/notifications/WhatsAppSettingsSection.tsx`).
Testé.

**Étape 4 (livrée, partielle)** : branchement métier.
- Rappels de paiement (`POST /payments/send-reminders/`) : pipeline complet
  tracé — job Arq dédié par facture, idempotent, avec fallback si Redis est
  indisponible. Testé.
- Absence/notes/bulletin (`POST /communication/send-notification-email/`) :
  tracking ajouté (`notification_events` créé après chaque tentative
  WhatsApp) sur le chemin **synchrone existant**, sans le faire passer par
  la queue Arq — cet endpoint répond immédiatement au frontend avec le
  résultat réel de l'envoi, contrat préservé. Limite persistante :
  `provider_message_id` n'est pas capturé sur ce chemin (contrairement aux
  paiements), donc les mises à jour de statut par webhook (delivered/read)
  ne s'appliquent pas à ces événements. **À migrer vers Arq** (voir Limites
  ci-dessous) pour aligner sur le pipeline paiements.

**Étape 5 (livrée)** : persistance des conversations entrantes
(`message_threads`/`message_items`) — un parent qui répond sur WhatsApp
voit son message conservé et consultable côté admin
(`GET /communication/whatsapp-threads/`,
`GET /communication/whatsapp-threads/{id}/messages/`), pas seulement compté.
Un expéditeur non reconnu (numéro qui ne correspond à aucun `User`) obtient
quand même un thread — jamais de message perdu.

**Étape 6 (livrée)** : réponse école → parent
(`POST /communication/conversations/{thread_id}/reply-whatsapp/`) — mise en
file via job Arq (`send_whatsapp_reply_job`), jamais envoyée en direct
depuis la requête HTTP entrante ni depuis le frontend. Le numéro du
destinataire est toujours résolu depuis `thread.parent_id → User.phone`,
jamais depuis un champ du corps de la requête. Idempotent
(`X-Idempotency-Key`). Testé.

**Étape 7 (livrée)** : distinction des expéditeurs inconnus. Avant cette
étape, tous les numéros non reconnus par `_find_parent_by_phone()`
partageaient un seul et même thread (`parent_id IS NULL`), fusionnant des
inconnus sans rapport entre eux. Chaque `message_threads` porte désormais
`external_sender_hash` (`sha256(numéro_normalisé + tenant_id + pepper)`,
jamais le numéro en clair) et `external_sender_masked` (forme affichable,
ex. `2247******01`) pour les threads sans `parent_id`. Deux inconnus
différents créent deux threads distincts ; le même inconnu réutilise le
sien. Ces deux colonnes restent `NULL` dès qu'un `parent_id` est connu —
comportement inchangé pour les parents identifiés. Testé
(`tests/test_whatsapp_messages.py::TestUnknownSenderThreadIsolation`).

## Architecture

```
backend/app/services/notifications.py
  └── WhatsAppSender          # 1 appel HTTP Graph API, ne sait rien d'autre

backend/app/services/whatsapp_service.py
  ├── send_whatsapp_template()      # crée un NotificationEvent, appelle WhatsAppSender, met à jour le statut
  ├── send_text_message()           # envoi libre (fenêtre 24h) — bouton "test", réponses
  ├── send_payment_reminder_whatsapp() / send_absence_alert_whatsapp() / ...
  ├── verify_webhook()              # handshake GET Meta
  ├── process_webhook_event()       # POST Meta — statuts + persistance des messages entrants
  ├── apply_webhook_status()        # idempotent, ne rétrograde jamais un statut déjà avancé
  ├── hash_external_sender()        # identité stable d'un numéro inconnu, sans jamais le stocker en clair
  ├── mask_phone_for_display()      # forme affichable côté admin pour un thread sans parent_id connu
  ├── _find_or_create_thread()      # 1 thread par (tenant, parent) OU par (tenant, external_sender_hash)
  └── send_whatsapp_reply()         # réponse école→parent, appelée par le job Arq, jamais depuis la requête HTTP

backend/app/workers/tasks.py
  ├── send_whatsapp_notification()          # 1 envoi, hors requête HTTP
  ├── send_bulk_whatsapp_notifications()    # lot indépendant, 1 échec n'arrête pas le lot
  ├── retry_failed_notifications()          # ré-essaie les FAILED, résout le téléphone depuis User (jamais depuis la valeur masquée stockée)
  ├── sync_whatsapp_statuses()              # PAS un poller (Meta n'en propose pas) — signale les envois bloqués sans webhook reçu
  └── send_whatsapp_reply_job()             # envoie une réponse école→parent mise en file par l'endpoint reply-whatsapp/
```

## Configuration (par établissement)

Stockée dans `tenants.settings` (JSON), jamais en variable d'environnement
plateforme :

```json
{
  "whatsappAccessToken": "EAAxxxxx...",
  "whatsappPhoneId": "1234567890",
  "whatsappVerifyToken": "un-secret-choisi-par-vous",
  "whatsappAppSecret": "app-secret-meta-optionnel-en-dev-obligatoire-en-prod"
}
```

- `whatsappVerifyToken` : requis pour que le handshake GET Meta fonctionne
  (Meta → Configuration → Webhook → "Verify Token", même valeur des deux
  côtés).
- `whatsappAppSecret` : **obligatoire en production/staging** (voir Étape 2
  ci-dessus), optionnel en dev. Active la vérification de signature HMAC
  sur chaque événement POST (Meta → Paramètres de l'app → "App Secret").
  Sans lui en production, chaque webhook entrant est rejeté avec un 403.

À ajouter dans une prochaine étape : `whatsappBusinessAccountId`,
`whatsappDefaultLanguage`.

## Templates Meta

Chaque template doit être créé et approuvé dans Meta Business Manager
(developers.facebook.com → WhatsApp → Message Templates) **avant** de
pouvoir être envoyé de façon proactive (hors fenêtre de 24h après un message
du destinataire). **Aucun template n'est encore créé/approuvé côté Meta** —
c'est le principal blocage business avant un envoi proactif réel en
production (voir docs/WHATSAPP_REAL_VALIDATION.md).

| Clé interne | Nom Meta | Variables (ordre) | Exemple FR | Cas d'usage | Statut |
|---|---|---|---|---|---|
| `payment_reminder` | `payment_reminder_school` | parent_name, invoice_number, amount, due_date, school_name | "Bonjour Mariama, la facture INV-001 de 500000 GNF pour Ibrahima est en attente (échéance 15/08)." | Rappel de facture impayée | À créer/approuver dans Meta |
| `absence_alert` | `absence_alert_school` | parent_name, student_name, subject, date, school_name | "Ibrahima était absent au cours de Maths le 01/08." | Absence non justifiée | À créer/approuver dans Meta |
| `grade_alert` | `grade_alert_school` | parent_name, student_name, grade, max_grade, subject, school_name | "Ibrahima a obtenu 15/20 en Maths (Devoir 1)." | Nouvelle note publiée | À créer/approuver dans Meta |
| `homework_due` | `homework_due_school` | (à définir) | — | Rappel de devoir | À créer/approuver dans Meta |
| `bulletin_ready` | `bulletin_ready_school` | parent_name, student_name, term, school_name | "Le bulletin d'Ibrahima pour le Trimestre 1 est disponible." | Bulletin publié | À créer/approuver dans Meta |
| `account_invitation` | `account_invitation_school` | user_name, setup_url, school_name | "Votre compte École X a été créé. Choisissez votre mot de passe : [lien]" | Invitation compte | À créer/approuver dans Meta |
| — | `school_message_parent` | (à définir) | — | Message direction → parent (centre de messages) | Non implémenté — la réponse école→parent actuelle (`reply-whatsapp/`) envoie du texte libre en fenêtre 24h, pas un template |
| — | `teacher_message_parent` | (à définir) | — | Message prof → parent (centre de messages) | Non implémenté |

Tant qu'un template n'est pas approuvé, `WhatsAppSender.send_smart()` retombe
automatiquement sur un message texte libre — mais **cela ne fonctionne que
si le parent a déjà écrit au numéro dans les 24h précédentes** (règle Meta).
Sans template approuvé, l'envoi proactif (rappel de paiement, alerte
d'absence) échouera silencieusement hors de cette fenêtre.

## Journal de dispatch (`notification_events`)

Une ligne par tentative d'envoi, quel que soit le résultat. Champs clés :
`status` (PENDING/SENT/DELIVERED/READ/FAILED), `provider_message_id`
(wamid Meta, unique — sert à faire correspondre les webhooks de statut sans
jamais compter un événement deux fois), `recipient_phone`/`recipient_email`
**toujours masqués** (ex: `2246******89`) — cette table est un journal
support, pas un entrepôt de données personnelles.

## Conversations (`message_threads` / `message_items`)

Une conversation réelle, distincte du journal `notification_events` :
`message_threads` regroupe les échanges avec un parent (ou un expéditeur
non identifié) ; `message_items` est un message dans un sens ou l'autre.

- **Parent identifié** (`parent_id` résolu par `_find_parent_by_phone()`) :
  un thread `OPEN` par (tenant, parent, canal), réutilisé pour tous les
  messages suivants tant qu'il n'est pas fermé.
- **Expéditeur non identifié** : `parent_id` reste `NULL`, mais le thread
  porte `external_sender_hash`/`external_sender_masked` (voir Étape 7) —
  jamais le numéro en clair. Deux inconnus distincts = deux threads
  distincts. Un même inconnu réutilise son thread.
- Toute redélivrance Meta du même `provider_message_id` est un no-op
  (`process_webhook_event()` vérifie l'existence avant insertion).

## Idempotence

- **Envoi** : passer un `_job_id` stable à `enqueue_job()` (ex.
  `f"wa:{event_type}:{student_id}:{invoice_number}"`) — Arq refuse
  silencieusement un second enqueue avec le même id (voir
  `app/core/jobs.py`).
- **Webhook (statuts)** : `provider_message_id` est unique en base ;
  `apply_webhook_status()` n'accepte jamais de rétrograder un statut déjà
  avancé (READ ne redevient jamais DELIVERED si un événement dupliqué/en
  retard arrive).
- **Webhook (messages entrants)** : `provider_message_id` unique sur
  `message_items` — un événement redélivré n'insère jamais deux fois le
  même message.
- **Réponse école→parent** : `POST .../reply-whatsapp/` accepte un
  `X-Idempotency-Key` (voir `app/core/idempotency.py`), protégé par une
  contrainte unique DB `(tenant_id, user_id, key)` — un double clic ou un
  retry réseau ne crée jamais deux réponses.

## Limites connues de cette étape

- **Aucun template Meta créé/approuvé** — blocage business principal avant
  un envoi proactif réel hors fenêtre de 24h (voir tableau Templates
  ci-dessus).
- **Validation Meta réelle non exécutée** depuis cet environnement de
  développement (pas de compte Meta Business/numéro réel disponible) — voir
  `docs/WHATSAPP_REAL_VALIDATION.md` pour la checklist manuelle et
  `docs/PRODUCTION_VALIDATION_RESULTS.md` pour le dernier état d'exécution
  connu.
- **Média non stocké** — un message entrant non textuel (image, audio,
  localisation…) est persisté avec un texte placeholder
  (`"[message image reçu — non affichable ici]"`), jamais le fichier
  lui-même. Un membre du staff doit rappeler le parent si le contenu du
  média compte.
- **Absence/notes/bulletin encore synchrones** — contrairement aux rappels
  de paiement, ce chemin n'est pas encore passé par la queue Arq ; il
  fonctionne (testé) mais ne capture pas `provider_message_id`, donc pas de
  mise à jour de statut par webhook pour ces événements-là. À migrer vers
  Arq dans une prochaine étape pour aligner sur le pipeline paiements.
- **Le handshake GET essaie le `whatsappVerifyToken` de tous les tenants**
  jusqu'à trouver une correspondance — acceptable au volume actuel, à
  revoir si le nombre d'établissements devient important.

## Erreurs fréquentes

- **"Template not approved"** : le template n'a pas encore été validé côté
  Meta Business Manager — vérifier son statut dans le dashboard Meta.
- **Message envoyé mais jamais marqué DELIVERED** : webhook non reçu —
  vérifier la souscription de l'app Meta au champ `messages`, et que
  `whatsappVerifyToken` correspond bien à celui configuré sur Meta.
- **"you can only send template messages"** hors template : la fenêtre de
  24h après le dernier message du parent est dépassée — seul un template
  approuvé peut relancer la conversation.
- **403 "App secret not configured" en production** : `whatsappAppSecret`
  n'est pas renseigné pour ce tenant — obligatoire dès que
  `ENVIRONMENT=production` ou `staging` (voir Configuration ci-dessus).
