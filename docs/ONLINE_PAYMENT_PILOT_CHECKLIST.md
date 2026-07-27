# Checklist — premier paiement en ligne réel (CinetPay / PayTech)

L'intégration Mobile Money / Orange Money / Wave est **déjà codée et
sécurisée** (`app/services/payment_gateways.py` — `CinetPayGateway`,
`PayTechGateway`, signature webhook vérifiée). Elle n'a **jamais été
exercée contre l'API réelle d'un fournisseur**. Ce document n'ajoute pas
de code — c'est la procédure de test à suivre avec un compte marchand réel
avant de vendre "paiement en ligne" comme prêt à un client payant. Voir
aussi `docs/PAYMENTS_READINESS.md` (état général du module paiements).

## 1. Variables et compte marchand nécessaires

| Élément | Où | Détail |
|---|---|---|
| Compte marchand CinetPay **ou** PayTech | Externe (CinetPay/PayTech) | Un seul suffit pour le premier test — CinetPay couvre la Guinée, PayTech couvre le Sénégal/Wave/Orange Money via agrégateur |
| `cinetPayApiKey` + `cinetPaySiteId` (si CinetPay) | `tenant.settings` (JSON, via `PATCH /tenants/{id}/` avec `{"settings": {...}}`) | Jamais en variable d'environnement globale — c'est **par tenant**, pas par plateforme (chaque établissement a son propre compte marchand) |
| `paytechApiKey` + `paytechSecretKey` (si PayTech) | `tenant.settings` | Idem, par tenant |
| `BACKEND_URL` | Variable d'environnement backend (`.env`/`.env.docker`) | Doit être l'URL **publiquement accessible** de l'API (pas `localhost`) — le fournisseur doit pouvoir appeler le webhook depuis l'extérieur |
| `FRONTEND_URL` | Variable d'environnement backend | Utilisée pour construire l'URL de retour après paiement |

**Point de vigilance critique** : en local/Docker, `BACKEND_URL=localhost`
ne fonctionnera jamais pour ce test — CinetPay/PayTech ne peuvent pas
appeler un webhook sur `localhost`. Utiliser un tunnel (ngrok ou
équivalent) ou tester directement contre un environnement de staging
accessible publiquement.

## 2. Montant minimal

Utiliser le **plus petit montant accepté par le fournisseur** (souvent
100 GNF / quelques dizaines de FCFA selon CinetPay/PayTech) sur une
facture de test créée spécifiquement pour ce pilote — jamais sur une
facture réelle d'un élève existant.

## 3. Étapes du test de bout en bout

1. **Configurer les identifiants** sur le tenant pilote :
   `PATCH /tenants/{id}/` avec `settings.cinetPayApiKey`/`cinetPaySiteId`
   (ou `paytechApiKey`/`paytechSecretKey`).
2. **Créer une facture de test** (`POST /payments/invoices/`) avec un
   montant minimal.
3. **Créer l'intention de paiement** :
   `POST /payments/intent/?amount=<montant>&method=CINETPAY&invoice_id=<id>`
   (ou `method=PAYTECH`). Vérifier la réponse : `payment_url` doit être une
   vraie URL du fournisseur, pas une erreur 502 ("passerelle indisponible").
4. **Suivre `payment_url` manuellement** (navigateur) et compléter le
   paiement côté fournisseur avec un moyen de paiement de test réel
   (Mobile Money réel, montant minimal).
5. **Vérifier la création du paiement `PENDING`** en base
   (`SELECT * FROM payments WHERE reference = '<transaction_id>'`) —
   il doit exister **avant** la confirmation webhook (créé à l'étape 3).
6. **Vérifier la réception du webhook** :
   `POST /parents/payments/webhook/cinetpay/` (ou `/paytech/`) — surveiller
   les logs serveur (`logger.info("CinetPay webhook received: ...")`).
7. **Vérifier la mise à jour de la facture** : `invoices.status` et
   `invoices.paid_amount` doivent refléter le paiement confirmé.
8. **Vérifier le reçu** : `GET /payments/{id}/receipt/` doit maintenant
   afficher un reçu numéroté pour ce paiement.
9. **Vérifier l'audit log** : une entrée `INITIATE_PAYMENT` (créée à
   l'étape 3) doit exister avec `resource_id` = l'id du paiement, et le
   webhook confirmé doit être visible dans les logs serveur.
10. **Rollback / erreur** : tester un cas d'échec délibéré (mauvais
    montant, webhook falsifié) et vérifier que :
    - `gw.verify_webhook(...)` rejette bien la requête (`{"status":
      "rejected", "reason": "verification failed"}`),
    - la facture **n'est jamais marquée payée** sur un webhook non vérifié,
    - le paiement reste `PENDING` (pas de suppression, pas de statut
      `COMPLETED` erroné) — cohérent avec la règle absolue du projet
      "ne jamais supprimer, toujours tracer".

## 4. Ce qui n'est PAS couvert par ce test

- **Aucun log de webhook échoué n'est persisté en base** aujourd'hui
  (seulement `logger.warning`, non queryable) — voir
  `GET /platform/tenants/{id}/health/`
  (`last_failed_payment_webhook_note`). Un `test_pg_dump`-style suivi
  structuré des échecs webhook est un P2 pour une phase ultérieure, pas
  un blocage pour le premier paiement pilote.
- **Numérotation de reçu séquentielle** — le reçu est unique
  (`PAY-{année}-{hex}`) mais pas incrémental (0001, 0002...). À clarifier
  avec le premier client réel si une comptabilité légale l'exige.

## 5. Verdict attendu à l'issue de ce test

- ✅ Si les 10 étapes passent : le paiement en ligne peut être promis
  comme "prêt" au premier client payant en ligne.
- ❌ Si le webhook n'arrive jamais (souvent un problème de `BACKEND_URL`
  non public, pas un bug du code) : corriger l'infrastructure réseau
  avant de reconsidérer le code.
- ⚠️ Si le paiement se confirme mais le reçu n'apparaît pas : bug réel à
  corriger avant toute promesse commerciale — ouvrir un P1.
