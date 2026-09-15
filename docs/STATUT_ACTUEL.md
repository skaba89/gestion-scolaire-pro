# Statut actuel — source de vérité datée

**Dernière mise à jour : 2026-09-14, contre le commit `73623a5` (`main`).**

Ce document existe parce que plusieurs documents stratégiques du dépôt
(`docs/PROJECT_ANALYSIS.md`, `docs/COMPETITIVE_ANALYSIS_2025.md`) ont pris
un retard important sur le code — voir les bandeaux d'avertissement ajoutés
en tête de ces fichiers. Il ne duplique pas le contenu détaillé des autres
docs : il pointe vers la source qui fait autorité pour chaque sujet, avec
une date de dernière vérification.

**Règle d'entretien** : toute PR qui livre une fonctionnalité listée
« non implémentée » dans un document stratégique existant doit soit
mettre à jour ce fichier, soit ajouter un bandeau d'avertissement au
document concerné (voir le format utilisé dans `PROJECT_ANALYSIS.md` et
`COMPETITIVE_ANALYSIS_2025.md`).

## Ce qui est vérifié comme implémenté (lecture directe du code, 2026-09-14)

| Domaine | État | Preuve dans le code |
|---|---|---|
| Paiement mobile money (Wave, Orange Money, MTN, CinetPay) | ✅ En production | `backend/app/services/payment_gateways.py`, `backend/app/api/v1/endpoints/finance/payments.py` |
| SMS (Android SMS Gateway, Africa's Talking) | ✅ En production | `backend/app/services/notifications.py` |
| Génération de relevés de notes / transcripts | ✅ En production | `backend/app/api/v1/endpoints/academic/transcripts.py` |
| Jobs asynchrones WhatsApp (absence, note, bulletin) | ✅ En production | `backend/app/workers/tasks.py`, voir `docs/reports/FINAL_PRODUCTION_READINESS_AUDIT.md` |
| MFA (TOTP + codes de secours) | ✅ En production | `backend/tests/test_mfa_enforcement.py` |
| Row-Level Security PostgreSQL | 🟡 Activée, non vérifiée en production | Voir réserve ci-dessous |

## Ce qui reste non vérifié ou non résolu

Ne pas dupliquer ici — se référer directement à ces documents, qui restent
à jour et déjà écrits dans cet esprit :

- **Sécurité** (RLS/superutilisateur en prod, throttling par tenant) :
  `docs/SECURITY_MODEL.md`, section « Risques connus »
- **Scalabilité nationale** (charge testée, monitoring par tenant) :
  `docs/NATIONAL_SCALE_READINESS.md`
- **P0/P1/P2 de mise en production** : `docs/reports/FINAL_PRODUCTION_READINESS_AUDIT.md`
- **Cohérence permissions backend/frontend** (modules non encore audités :
  finance, paiements, factures, RH, messages, journaux d'audit, imports/
  exports, bulletins, parents, enseignants, élèves) : `docs/PERMISSIONS_MATRIX.md`

## Documents à considérer avec prudence

| Document | Problème | À faire avant de le citer |
|---|---|---|
| `docs/PROJECT_ANALYSIS.md` | Décrit une architecture Supabase/Kong abandonnée | Ne pas utiliser — voir le bandeau en tête du fichier |
| `docs/COMPETITIVE_ANALYSIS_2025.md` | 3 gaps « critiques » listés comme non implémentés sont en fait résolus (voir tableau ci-dessus) ; le reste (LMS, timetable auto, biométrie…) n'a pas été re-vérifié | Revérifier les gaps restants avant tout usage commercial ou institutionnel du document |

## Pour une présentation institutionnelle (ministère, partenaire, bailleur)

Avant de citer un chiffre ou une fonctionnalité de ce dépôt devant un tiers
externe, vérifier qu'il provient d'un document **daté après 2026-08** ou de
ce fichier — pas d'un document de 2025 non révisé.
