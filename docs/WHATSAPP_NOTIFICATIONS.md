# WhatsApp Cloud API — SchoolFlow Pro

## État du chantier

**Étape 1 (livrée)** : modèle de données (`notification_events`), service
d'orchestration (`whatsapp_service.py`), jobs Arq. Testé (34 tests), pas
encore branché sur les événements métier ni sur un endpoint webhook réel.

**Étapes suivantes** (non commencées) : endpoint webhook FastAPI, branchement
sur paiement/absence/notes/bulletin, endpoints admin de configuration
(`/notifications/settings/`), interface frontend, persistance des messages
entrants (`message_threads`/`message_items`).

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
  "whatsappPhoneId": "1234567890"
}
```

À ajouter dans une prochaine étape : `whatsappVerifyToken` (validation
webhook), `whatsappBusinessAccountId`, `whatsappDefaultLanguage`.

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

- Pas d'endpoint webhook FastAPI encore branché (le service est prêt, pas
  l'endpoint) — un message entrant d'un parent n'est donc pas encore reçu
  en pratique.
- Pas de persistance des messages entrants (`message_threads`/`message_items`
  n'existent pas encore) — `process_webhook_event()` les compte sans les
  stocker.
- Aucun branchement sur les événements métier réels (paiement, absence,
  notes, bulletin) — les wrappers existent mais rien ne les appelle encore
  automatiquement.
- Aucune UI admin pour configurer `whatsappAccessToken`/`whatsappPhoneId`
  par établissement — à faire manuellement en base pour l'instant.

## Erreurs fréquentes (une fois le webhook branché)

- **"Template not approved"** : le template n'a pas encore été validé côté
  Meta Business Manager — vérifier son statut dans le dashboard Meta.
- **Message envoyé mais jamais marqué DELIVERED** : webhook non reçu —
  vérifier la souscription de l'app Meta au champ `messages`, et que
  `whatsappVerifyToken` correspond bien à celui configuré sur Meta.
- **"you can only send template messages"** hors template : la fenêtre de
  24h après le dernier message du parent est dépassée — seul un template
  approuvé peut relancer la conversation.
