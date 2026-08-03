# WhatsApp Cloud API — SchoolFlow Pro

## État du chantier

**Étape 1 (livrée)** : modèle de données (`notification_events`), service
d'orchestration (`whatsapp_service.py`), jobs Arq. Testé (34 tests).

**Étape 2 (livrée)** : endpoint webhook `GET/POST /api/v1/whatsapp/webhook/`
— validation Meta, réception des statuts (idempotente), vérification de
signature HMAC si `whatsappAppSecret` configuré. Testé (12 tests).

**Étape 3 (livrée)** : `GET/PATCH /api/v1/notifications/settings/` et
`POST /api/v1/notifications/whatsapp/test/` — configuration et test réel par
tenant, sans jamais exposer de secret. Testé (17 tests).

**Étape 4 (livrée, partielle)** : branchement métier.
- Rappels de paiement (`POST /payments/send-reminders/`) : pipeline complet
  tracé — job Arq dédié par facture, idempotent, avec fallback si Redis est
  indisponible. Testé (5 tests, dont 2 Postgres-only non exécutés localement).
- Absence/notes/bulletin (`POST /communication/send-notification-email/`) :
  tracking ajouté (`notification_events` créé après chaque tentative
  WhatsApp) sur le chemin **synchrone existant**, sans le faire passer par
  la queue Arq — cet endpoint répond immédiatement au frontend avec le
  résultat réel de l'envoi, contrat préservé. Limite : `provider_message_id`
  n'est pas capturé sur ce chemin (contrairement aux paiements), donc les
  mises à jour de statut par webhook (delivered/read) ne s'appliquent pas
  à ces événements. Testé (5 tests).

**Étapes suivantes** (non commencées) : migrer absence/notes/bulletin vers
la queue Arq (comme les paiements) pour capturer `provider_message_id` et
sortir l'appel WhatsApp du chemin de requête HTTP, interface frontend,
persistance des messages entrants (`message_threads`/`message_items`).

## Architecture

```
backend/app/services/notifications.py
  └── WhatsAppSender          # 1 appel HTTP Graph API, ne sait rien d'autre

backend/app/services/whatsapp_service.py
  ├── send_whatsapp_template()      # crée un NotificationEvent, appelle WhatsAppSender, met à jour le statut
  ├── send_text_message()           # envoi libre (fenêtre 24h) — bouton "test", réponses
  ├── send_payment_reminder_whatsapp() / send_absence_alert_whatsapp() / ...
  ├── verify_webhook()              # handshake GET Meta
  ├── process_webhook_event()       # POST Meta — statuts + comptage messages entrants
  └── apply_webhook_status()        # idempotent, ne rétrograde jamais un statut déjà avancé

backend/app/workers/tasks.py
  ├── send_whatsapp_notification()          # 1 envoi, hors requête HTTP
  ├── send_bulk_whatsapp_notifications()    # lot indépendant, 1 échec n'arrête pas le lot
  ├── retry_failed_notifications()          # ré-essaie les FAILED, résout le téléphone depuis User (jamais depuis la valeur masquée stockée)
  └── sync_whatsapp_statuses()              # PAS un poller (Meta n'en propose pas) — signale les envois bloqués sans webhook reçu
```

## Configuration (par établissement)

Stockée dans `tenants.settings` (JSON), jamais en variable d'environnement
plateforme :

```json
{
  "whatsappAccessToken": "EAAxxxxx...",
  "whatsappPhoneId": "1234567890",
  "whatsappVerifyToken": "un-secret-choisi-par-vous",
  "whatsappAppSecret": "app-secret-meta-optionnel"
}
```

- `whatsappVerifyToken` : requis pour que le handshake GET Meta fonctionne
  (Meta → Configuration → Webhook → "Verify Token", même valeur des deux
  côtés).
- `whatsappAppSecret` : optionnel mais recommandé — active la vérification
  de signature HMAC sur chaque événement POST (Meta → Paramètres de l'app →
  "App Secret"). Sans lui, les événements sont quand même traités, mais
  n'importe qui connaissant l'URL du webhook pourrait injecter de faux
  statuts.

À ajouter dans une prochaine étape : `whatsappBusinessAccountId`,
`whatsappDefaultLanguage`.

## Templates Meta

Chaque template doit être créé et approuvé dans Meta Business Manager
(developers.facebook.com → WhatsApp → Message Templates) **avant** de
pouvoir être envoyé de façon proactive (hors fenêtre de 24h après un message
du destinataire).

| Clé interne | Nom Meta | Variables (ordre) | Exemple FR | Cas d'usage | Statut |
|---|---|---|---|---|---|
| `payment_reminder` | `payment_reminder_school` | parent_name, invoice_number, amount, due_date, school_name | "Bonjour Mariama, la facture INV-001 de 500000 GNF pour Ibrahima est en attente (échéance 15/08)." | Rappel de facture impayée | À créer |
| `absence_alert` | `absence_alert_school` | parent_name, student_name, subject, date, school_name | "Ibrahima était absent au cours de Maths le 01/08." | Absence non justifiée | À créer |
| `grade_alert` | `grade_alert_school` | parent_name, student_name, grade, max_grade, subject, school_name | "Ibrahima a obtenu 15/20 en Maths (Devoir 1)." | Nouvelle note publiée | À créer |
| `homework_due` | `homework_due_school` | (à définir) | — | Rappel de devoir | À créer |
| `bulletin_ready` | `bulletin_ready_school` | parent_name, student_name, term, school_name | "Le bulletin d'Ibrahima pour le Trimestre 1 est disponible." | Bulletin publié | À créer |
| `account_invitation` | `account_invitation_school` | user_name, setup_url, school_name | "Votre compte École X a été créé. Choisissez votre mot de passe : [lien]" | Invitation compte | À créer |
| — | `school_message_parent` | (à définir) | — | Message direction → parent (centre de messages) | Non implémenté |
| — | `teacher_message_parent` | (à définir) | — | Message prof → parent (centre de messages) | Non implémenté |

Tant qu'un template n'est pas approuvé, `WhatsAppSender.send_smart()` retombe
automatiquement sur un message texte libre — mais **cela ne fonctionne que
si le parent a déjà écrit au numéro dans les 24h précédentes** (règle Meta).
Sans template approuvé, l'envoi proactif (rappel de paiement, alerte
d'absence) échouera silencieusement hors de cette fenêtre — c'est le
principal blocage business avant mise en production réelle.

## Journal de dispatch (`notification_events`)

Une ligne par tentative d'envoi, quel que soit le résultat. Champs clés :
`status` (PENDING/SENT/DELIVERED/READ/FAILED), `provider_message_id`
(wamid Meta, unique — sert à faire correspondre les webhooks de statut sans
jamais compter un événement deux fois), `recipient_phone`/`recipient_email`
**toujours masqués** (ex: `2246******89`) — cette table est un journal
support, pas un entrepôt de données personnelles.

## Idempotence

- **Envoi** : passer un `_job_id` stable à `enqueue_job()` (ex.
  `f"wa:{event_type}:{student_id}:{invoice_number}"`) — Arq refuse
  silencieusement un second enqueue avec le même id (voir
  `app/core/jobs.py`).
- **Webhook** : `provider_message_id` est unique en base ; `apply_webhook_status()`
  n'accepte jamais de rétrograder un statut déjà avancé (READ ne redevient
  jamais DELIVERED si un événement dupliqué/en retard arrive).

## Limites connues de cette étape

- Pas de persistance des messages entrants (`message_threads`/`message_items`
  n'existent pas encore) — `process_webhook_event()` les compte sans les
  stocker. Un parent qui répond sur WhatsApp aujourd'hui : l'événement est
  reçu et compté, mais son contenu n'est pas encore consultable côté admin.
- Vérification de signature POST optionnelle (seulement si
  `whatsappAppSecret` est configuré pour le tenant concerné) — sans elle,
  n'importe qui connaissant l'URL du webhook pourrait injecter de faux
  statuts de livraison pour un tenant sans `whatsappAppSecret`.
- Le handshake GET essaie le `whatsappVerifyToken` de **tous** les tenants
  jusqu'à trouver une correspondance — acceptable au volume actuel, mais à
  revoir (ex: un token par app Meta plutôt que par tenant) si le nombre
  d'établissements devient important.
- Aucun branchement sur les événements métier réels (paiement, absence,
  notes, bulletin) — les wrappers existent mais rien ne les appelle encore
  automatiquement.
- Aucune UI admin pour configurer `whatsappAccessToken`/`whatsappPhoneId`/
  `whatsappVerifyToken`/`whatsappAppSecret` par établissement — à faire
  manuellement en base pour l'instant.

## Erreurs fréquentes

- **"Template not approved"** : le template n'a pas encore été validé côté
  Meta Business Manager — vérifier son statut dans le dashboard Meta.
- **Message envoyé mais jamais marqué DELIVERED** : webhook non reçu —
  vérifier la souscription de l'app Meta au champ `messages`, et que
  `whatsappVerifyToken` correspond bien à celui configuré sur Meta.
- **"you can only send template messages"** hors template : la fenêtre de
  24h après le dernier message du parent est dépassée — seul un template
  approuvé peut relancer la conversation.
