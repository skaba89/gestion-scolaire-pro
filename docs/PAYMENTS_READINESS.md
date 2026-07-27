# État de préparation — Module Paiements (Phase 1 commercialisation)

Audit réel du code + tests, pas une promesse. Chaque affirmation renvoie
au fichier/endpoint qui l'implémente.

## État actuel — ce qui fonctionne (vérifié par tests)

| Capacité | État | Endpoint / fichier |
|---|---|---|
| Frais scolaires (CRUD) | ✅ | `GET/POST/PUT/DELETE /payments/fees/` |
| Factures (CRUD, pagination, scope PARENT à ses enfants) | ✅ | `GET/POST/PUT/DELETE /payments/invoices/` |
| Paiement complet | ✅ | `POST /payments/register/` |
| Paiement partiel | ✅ | même endpoint — `paid_amount` incrémenté, statut facture `PARTIAL` tant que non couvert, `PAID` une fois totalement réglé |
| Reçu numéroté | ✅ | `GET /payments/{id}/receipt/` — HTML imprimable en PDF, numéro = la référence unique générée à l'enregistrement |
| Annulation tracée | ✅ | `POST /payments/{id}/reverse/` — jamais de suppression, statut `REVERSED`, `notes` conservées, `paid_amount` de la facture recalculé |
| Reçu annulé visible comme tel | ✅ | le reçu HTML affiche explicitement "Paiement annulé" quand `status == REVERSED` |
| Audit log systématique | ✅ | `log_audit()` appelé avant chaque `commit()` sur `register_payment`, `reverse_payment`, `create_invoice`, `update_invoice`, `create_fee`, `update_fee` |
| Historique de paiement | ✅ | `GET /payments/` avec filtre `student_id`, pagination |
| Relance impayés | ✅ | `POST /payments/send-reminders/` — récupère les factures en retard avec contact parent |
| Tableau des impayés | ✅ (données) | `GET /analytics/debt-aging/` — répartition par ancienneté de créance |
| Dashboard financier | ✅ | `GET /analytics/financial-kpis/`, `/revenue-trend/`, `/revenue-by-category/` |
| Export brut des paiements | ✅ **ajouté cette phase** | `GET /payments/export/` (CSV, filtrable par élève/statut, audité) |
| Isolation tenant | ✅ | vérifiée sur chaque endpoint par tests dédiés (aucune fuite cross-tenant) |
| Aucune suppression physique | ✅ | confirmé — aucune route `DELETE` sur `/payments/`, seul `reverse/` existe |
| Webhook paiement sécurisé | ✅ | `POST /parents/payments/webhook/{cinetpay\|paytech}/` — CinetPay vérifié par rappel serveur-à-serveur, PayTech par HMAC-SHA256 (`hmac.compare_digest`) |
| Intégration Mobile Money / Orange Money / Wave | ✅ **déjà en place** | `app/services/payment_gateways.py` — `CinetPayGateway` (agrégateur couvrant la Guinée + Afrique francophone) et `PayTechGateway` (Wave/Orange Money/MTN via agrégateur sénégalais) |

## Ce qui manque

| Manque | Priorité | Impact |
|---|---|---|
| Export PDF de la liste des paiements (seul le CSV existe ; le reçu individuel est HTML→PDF navigateur, pas un export PDF en masse) | P2 | Confort comptable, pas bloquant — le CSV s'ouvre dans Excel/LibreOffice sans problème |
| Numérotation de reçu séquentielle par tenant (actuellement `PAY-{année}-{hex aléatoire}`, unique mais pas incrémental type "0001, 0002...") | P2 | Certaines administrations préfèrent une numérotation séquentielle pour la comptabilité légale — à vérifier avec un client pilote avant de considérer que c'est un vrai blocage |
| Test en conditions réelles avec des identifiants CinetPay/PayTech réels | P1 pour un client payant en ligne, non bloquant pour paiement manuel | Le paiement manuel contrôlé fonctionne dès aujourd'hui ; l'intégration en ligne est codée et sécurisée mais jamais exercée contre l'API réelle du fournisseur |
| Vue frontend dédiée "tableau des impayés" avec actions groupées (relancer tous, exporter la liste) | P2 | Les données existent (`debt-aging`), la vue UI n'a pas été auditée dans cette passe (hors périmètre backend) |

## Risques

- **CinetPay/PayTech non testés en conditions réelles** : le code suit la documentation officielle et est structurellement sain (signature vérifiée, montant validé côté webhook via `_gateway_amount_matches`), mais un premier paiement réel doit être fait avec un établissement pilote avant promesse commerciale ferme sur le paiement en ligne.
- **Numérotation de reçu non séquentielle** : à clarifier avec le premier client — si une numérotation légale séquentielle est exigée, c'est un changement de schéma mineur (ajouter un compteur par tenant), pas une refonte.

## Endpoints (référence complète)

```
GET    /payments/                    liste paginée, filtre student_id
GET    /payments/export/             export CSV, filtre student_id/status   [NOUVEAU]
GET    /payments/{id}/receipt/       reçu HTML numéroté
POST   /payments/register/           enregistrer un paiement (complet ou partiel)
POST   /payments/{id}/reverse/       annuler (tracé, jamais supprimé)
GET    /payments/sequence/           numéro de référence suivant
GET    /payments/invoices/           liste factures, scope PARENT->enfants
POST   /payments/invoices/           créer facture
PUT    /payments/invoices/{id}/      modifier facture
DELETE /payments/invoices/{id}/      supprimer facture (brouillon uniquement — à vérifier)
POST   /payments/send-reminders/     relance impayés
GET    /payments/fees/               liste frais scolaires
POST   /payments/fees/               créer frais scolaire
PUT    /payments/fees/{id}/          modifier frais scolaire
DELETE /payments/fees/{id}/          supprimer frais scolaire
POST   /payments/send-invoice-email/ envoyer facture par email
POST   /payments/intent/             créer une intention de paiement en ligne (CinetPay/PayTech)
POST   /parents/payments/webhook/{gateway}/  callback fournisseur (signature vérifiée)
GET    /analytics/financial-kpis/    KPI financiers agrégés
GET    /analytics/revenue-trend/     tendance de revenus
GET    /analytics/debt-aging/        impayés par ancienneté
GET    /analytics/revenue-by-category/  revenus par catégorie
```

## Tests

- `test_payments.py` : schémas, garde-fous d'authentification, gateways, injection SQL sur ORDER BY, validation d'intention de paiement.
- `test_payment_receipt.py` : reçu numéroté, affichage d'annulation, permission requise, isolation inter-tenant, **export CSV (nouveau, 4 tests)**.
- Suite complète backend : 490 passed sur PostgreSQL isolé, aucune régression.

## Plan Orange Money / Wave

L'infrastructure d'intégration existe déjà (`CinetPayGateway`, `PayTechGateway`) et couvre nativement Orange Money et Wave via ces deux agrégateurs (pas besoin d'intégration directe séparée avec chaque opérateur — c'est justement le rôle d'un agrégateur). Étapes restantes avant activation commerciale :

1. Obtenir des identifiants CinetPay et/ou PayTech réels (compte marchand).
2. Configurer `tenant.settings.cinetPayApiKey`/`cinetPaySiteId` (ou `paytechApiKey`/`paytechSecretKey`) pour le tenant pilote.
3. Effectuer un paiement réel de bout en bout (montant minimal) avec l'établissement pilote.
4. Vérifier la réconciliation webhook → statut facture → reçu généré.
5. Une fois validé, documenter la procédure d'activation pour les établissements suivants dans `docs/SUPPORT_RUNBOOK.md`.

Aucun développement supplémentaire n'est requis pour ce plan — uniquement de la configuration et un test réel avec un compte marchand.
