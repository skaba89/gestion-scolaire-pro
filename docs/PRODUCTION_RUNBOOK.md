# Runbook support production — Academy Guinéenne

Phase 8 (audit national, finalisation avant commercialisation large).

Ce document couvre spécifiquement les scénarios d'incident **non déjà
couverts** par les runbooks existants — il les référence plutôt que de les
dupliquer :

- **API/frontend/worker en panne, redémarrage, backup/restauration,
  révocation utilisateur, désactivation tenant, diagnostic de lenteur,
  vérification des logs** → [`docs/OPERATIONS_RUNBOOK.md`](OPERATIONS_RUNBOOK.md)
  (commandes réelles, testées, tirées du code de ce dépôt).
- **Création d'école, réinitialisation mot de passe, vérification/
  annulation de paiement, import d'élèves, diagnostic connexion/lenteur,
  escalade d'incident (P1/P2/P3)** → [`docs/SUPPORT_RUNBOOK.md`](SUPPORT_RUNBOOK.md).
- **Configuration/dépannage WhatsApp (template rejeté, signature
  invalide, fenêtre 24h dépassée)** → [`docs/WHATSAPP_NOTIFICATIONS.md`](WHATSAPP_NOTIFICATIONS.md),
  section "Erreurs fréquentes".

Toutes les commandes ci-dessous sont réelles, tirées du code de ce dépôt —
pas de placeholder générique.

---

## 1. Resend (email) en panne

**Symptôme** : emails de notification (bienvenue, formulaire public,
rappel de paiement) non reçus ; `email_sent: false` dans les réponses de
jobs concernés (voir `backend/app/workers/tasks.py`).

1. Vérifier le statut Resend : [status.resend.com](https://status.resend.com).
2. Confirmer que ce n'est pas une mauvaise configuration locale :
   `GET /health/deep/` (voir §3 de `OPERATIONS_RUNBOOK.md`) ne teste pas
   Resend directement — vérifier plutôt les logs applicatifs pour
   `EmailSender.send` / `Resend API error`.
3. **Aucun email n'échoue silencieusement de façon bloquante** — c'est un
   principe de conception déjà en place : `send_public_form_submission_alert`
   (backend/app/workers/tasks.py) englobe l'étape email dans un
   `try/except` large ; un email raté n'empêche jamais la notification
   in-app de réussir (testé : `test_job_does_not_crash_when_email_send_raises`,
   `backend/tests/test_public_form_notifications.py`). Même logique pour
   les rappels de paiement.
4. Si la panne dure : informer les écoles concernées que les notifications
   in-app/WhatsApp restent le canal fiable en attendant le rétablissement
   d'Resend — aucune action côté code n'est nécessaire, le système se
   rétablit de lui-même dès que Resend répond de nouveau (pas de file à
   vider, chaque tentative est indépendante).
5. Vérifier `RESEND_API_KEY` n'a pas expiré/été révoquée (dashboard
   Resend → API Keys) si la panne persiste au-delà du statut public
   Resend redevenu vert.

---

## 2. Webhook WhatsApp (Meta) en panne ou inaccessible

**Symptôme** : les statuts delivered/read n'arrivent plus (`sync_whatsapp_statuses`
signale des événements `SENT` bloqués — voir `backend/app/workers/tasks.py`),
ou les messages entrants des parents n'apparaissent plus dans
`GET /communication/whatsapp-threads/`.

1. Vérifier la souscription Meta : Meta Business Manager → l'app → Webhooks
   → champ `messages` toujours abonné (`Subscribe` actif).
2. Tester le handshake manuellement :
   ```bash
   curl "https://api.schoolflow.pro/api/v1/whatsapp/webhook/?hub.mode=subscribe&hub.verify_token=<verify_token_du_tenant>&hub.challenge=test123"
   ```
   Doit renvoyer `test123` en texte brut, 200. Une 403 signifie que
   `whatsappVerifyToken` (settings du tenant) ne correspond plus à celui
   configuré côté Meta.
3. En production/staging, une requête POST sans signature
   `X-Hub-Signature-256` valide est **rejetée avec 403 par design** (voir
   `app/api/v1/endpoints/core/whatsapp_webhook.py::_is_production()`) —
   ce n'est pas un bug si les logs montrent des 403 : vérifier que
   `whatsappAppSecret` du tenant correspond bien à l'App Secret Meta
   actuel (une rotation de secret côté Meta sans mise à jour du tenant
   causera exactement ce symptôme).
4. Si le webhook lui-même est down côté plateforme (5xx sur
   `/whatsapp/webhook/`) : traiter comme une panne API classique (§ correspondante
   dans `OPERATIONS_RUNBOOK.md`) — c'est le même processus API, pas un
   service séparé.
5. Une fois rétabli : `sync_whatsapp_statuses` (job périodique) ne
   "rattrape" pas les statuts manqués pendant la panne — Meta ne propose
   pas d'endpoint de re-livraison des statuts passés (voir sa docstring
   dans `tasks.py`). Les événements restés `SENT` sans confirmation
   `DELIVERED`/`READ` pendant la fenêtre de panne le resteront ; ce n'est
   pas un bug à corriger, c'est une limite du webhook Meta lui-même.

---

## 3. Messages WhatsApp bloqués en `SENT`/`QUEUED`

**Symptôme** : `notification_events.status` reste `SENT` (ou le job Arq
reste `RUNNING`) bien au-delà du temps normal de livraison.

1. `sync_whatsapp_statuses` (`backend/app/workers/tasks.py`) signale déjà
   automatiquement les événements `SENT` restés bloqués plus de
   `stale_after_hours` (6h par défaut) — vérifier ses résultats plutôt que
   de chercher manuellement :
   ```sql
   SELECT status, count(*) FROM notification_events
   WHERE tenant_id = '<tenant>' AND created_at > now() - interval '24 hours'
   GROUP BY status;
   ```
2. Cause la plus fréquente : le webhook Meta n'a jamais confirmé la
   livraison (voir §2 ci-dessus) — vérifier d'abord que le webhook
   fonctionne avant de suspecter autre chose.
3. Cause possible : fenêtre de 24h dépassée sans template approuvé — voir
   `docs/WHATSAPP_NOTIFICATIONS.md`, section "Erreurs fréquentes",
   `"you can only send template messages"`.
4. Un job Arq resté `RUNNING` dans la table `jobs` sans jamais passer
   `SUCCESS`/`FAILED` indique un worker qui a crashé en cours d'exécution
   (pas juste un ralentissement Meta) — vérifier
   `docker compose logs worker` (ou les logs du service worker sur
   Render) pour une exception non gérée, puis relancer le worker (§1 de
   `OPERATIONS_RUNBOOK.md`).
5. **Ne jamais** modifier `notification_events.status` directement en
   base pour "forcer" un statut — le webhook/la synchro le fera
   correctement, une correction manuelle fausse l'historique d'audit.

---

## 4. Spam sur le formulaire public de contact

**Symptôme** : volume anormal de `PublicFormSubmission` sur un tenant,
souvent avec des noms/messages incohérents.

1. Le honeypot (champ `website`, invisible en CSS pour un humain) est déjà
   actif — `submit_public_form` (backend/app/api/v1/endpoints/*/public_pages.py)
   journalise `honeypot triggered` et renvoie 204 sans jamais créer la
   soumission ni révéler au bot qu'il a été bloqué (même réponse qu'un
   tenant inexistant — voir `test_public_form_submissions.py`).
2. Le formulaire est aussi limité en débit par IP+tenant (voir
   `TestRateLimit` dans `test_public_form_submissions.py`, 429 au-delà du
   seuil) — un flot dépassant cette limite est déjà bloqué automatiquement,
   pas besoin d'intervention.
3. Si du spam passe malgré tout (honeypot contourné, volume sous le seuil
   de débit mais répété sur la durée) :
   - Supprimer les soumissions frauduleuses une par une :
     `DELETE /api/v1/public-pages/submissions/{submission_id}/`
     (authentifié, permission tenant admin — voir `delete_submission`).
   - Pas d'endpoint de suppression en masse aujourd'hui — pour un volume
     important, une suppression SQL directe scoping strictement sur
     `tenant_id` et une plage de dates est la seule option, à valider
     avec l'équipe technique avant exécution (jamais en urgence sans
     double vérification du `WHERE`).
4. Si le spam cible un tenant spécifique de façon répétée et ciblée
   (au-delà d'un bot générique) : envisager de resserrer temporairement
   le rate-limit de ce tenant via `QuotaMiddleware`
   (`backend/app/middlewares/quota.py`) plutôt que de désactiver le
   formulaire public entièrement.

---

## 5. Purge des messages publics

**Déjà automatisé** — pas une procédure manuelle à exécuter en temps
normal :

- `purge_old_public_form_submissions` (`backend/app/workers/tasks.py`)
  tourne chaque nuit à 3h30 (cron Arq, voir `WorkerSettings.cron_jobs`) et
  supprime les soumissions plus vieilles que `PUBLIC_FORM_RETENTION_DAYS`
  (365 jours par défaut, configurable par déploiement — voir
  `app/core/config.py`).

**Purge manuelle anticipée** (ex. demande RGPD explicite d'un visiteur,
ou nettoyage après un incident de spam contenant des données
personnelles) :

```bash
# Depuis un shell avec accès à l'app (ex. `docker compose exec api bash`) :
python -c "
import asyncio
from app.workers.tasks import purge_old_public_form_submissions
print(asyncio.run(purge_old_public_form_submissions({}, retention_days=0)))
"
```
`retention_days=0` supprime tout ce qui a été créé avant l'instant présent
pour tous les tenants — **destructif et non réversible**, à ne jamais
exécuter sans confirmation explicite d'un responsable, et jamais utilisé
comme méthode de suppression ciblée pour un seul tenant (préférer §4 pour
un cas ciblé).

---

## 6. Rollback de déploiement

Voir [`docs/DEPLOIEMENT_PRODUCTION.md`](DEPLOIEMENT_PRODUCTION.md), section
"Rollback", pour la procédure de base (redéployer le commit précédent,
jamais de `alembic downgrade` en production sans dump préalable). Complément
opérationnel :

1. **Avant tout rollback** : `bash scripts/backup-database.sh` (voir §2 de
   `OPERATIONS_RUNBOOK.md`) — même si le déploiement actuel semble
   fautif, il peut contenir des écritures récentes légitimes absentes du
   dernier backup automatique.
2. Les migrations de ce dépôt sont **strictement additives** par
   convention (règle absolue de ce projet : ne jamais supprimer une
   migration existante) — un rollback de code vers un commit antérieur
   reste donc compatible avec un schéma de base plus récent dans la
   quasi-totalité des cas (les nouvelles colonnes/tables sont simplement
   ignorées par l'ancien code). Un rollback de schéma
   (`alembic downgrade`) n'est nécessaire que si la migration la plus
   récente a un downgrade défini ET que le code revient à une version qui
   ne tolère pas le nouveau schéma — cas rare, à valider explicitly.
3. Render : redéployer un déploiement précédent depuis l'onglet
   "Deploys" du service (bouton "Redeploy" sur le commit voulu) — pas de
   commande CLI équivalente documentée pour ce projet à ce jour.
4. Après rollback : `curl https://api.schoolflow.pro/health/ready` (§3 de
   `OPERATIONS_RUNBOOK.md`) pour confirmer que le service revenu en
   arrière est bien sain avant de considérer l'incident clos.

---

## 7. Contact support client

Pas de canal dédié documenté dans ce dépôt à ce jour (produit en phase
pilote, un seul établissement réel — Université La Source). À définir
avant une commercialisation large : canal (email/WhatsApp Business
dédié/téléphone), heures de couverture. `docs/SLA.md` existe déjà dans ce
dépôt pour les engagements de délai par sévérité — s'y référer plutôt
que d'en redéfinir un ici (son contenu n'a pas été audité dans cette
session, seule son existence a été confirmée).

---

## 8. Checklist post-incident

Reprend l'annexe de `OPERATIONS_RUNBOOK.md` — dupliquée ici pour qu'un
support de premier niveau n'ait pas besoin de naviguer entre deux
documents pendant un incident WhatsApp/email/spam :

- [ ] Cause racine identifiée (pas seulement le symptôme corrigé)
- [ ] Tenant(s) affecté(s) et fenêtre temporelle exacte notés
- [ ] Si la cause révèle un bug de sécurité (RLS, fuite cross-tenant) :
      traiter avec la même rigueur qu'un incident P1, corriger, ajouter un
      test qui aurait détecté le problème
- [ ] Si la cause est une limite connue et déjà documentée (ex. Meta
      n'offre pas de re-livraison de statuts, §2) : confirmer qu'elle est
      bien dans ce document, sinon l'ajouter
- [ ] Utilisateurs/écoles affectés informés si l'incident a eu un impact
      visible
