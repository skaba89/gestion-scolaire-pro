# Rapport final — Corrections fines post-audit (5 points restants)

**Date** : 2026-08-05
**Commit** : `0d7b2b1`
**Exécuté** : en autonomie, sur la stack Docker locale (Postgres, Redis, API, worker, frontend)

---

## 1. Fichiers modifiés

**Backend**
- `backend/app/services/whatsapp_service.py` — `hash_external_sender()`, `mask_phone_for_display()`, `_find_or_create_thread()` étendu
- `backend/app/models/message_thread.py` — colonnes `external_sender_hash`/`external_sender_masked`
- `backend/app/models/idempotency_key.py` — `UniqueConstraint` ajoutée au modèle (manquait côté SQLAlchemy)
- `backend/app/workers/tasks.py` — job `purge_expired_idempotency_keys` (manuel + cron quotidien)
- `backend/app/api/v1/endpoints/operational/communication.py` — `external_sender_masked` exposé dans l'inbox

**Frontend**
- `src/services`/`src/queries/communication.ts` — inchangé fonctionnellement, déjà conforme (vérifié)
- `src/hooks/useOfflineSync.ts` — **fix P0** : un conflit 409 n'est plus traité comme un succès silencieux
- `src/lib/offlineDb.ts` — champ `syncStatus` (Dexie v2), `getRejectedDrafts()`
- `src/offline/db.ts` / `src/offline/outbox.ts` — statuts SYNCED/REJECTED persistés et visibles, conflit 409 distingué
- `src/hooks/useOfflineQueueSync.ts` — toast distinct pour les conflits
- `src/components/offline/OfflineBanner.tsx` — affichage des conflits
- `src/components/messages/WhatsAppThreadsPanel.tsx` — numéro masqué affiché pour un inconnu

**Documentation**
- `docs/WHATSAPP_NOTIFICATIONS.md` — remis à jour (état réel livré vs limites)
- `docs/PRODUCTION_VALIDATION_RESULTS.md` — nouveau, rapport honnête de validation

## 2. Migrations ajoutées

- `20260805_0001_message_thread_external_sender.py` — `external_sender_hash`/`external_sender_masked` sur `message_threads`, additive
- `20260805_0002_idempotency_keys_created_at_index.py` — index sur `created_at`, additive

Les deux appliquées avec succès sur Postgres réel (`alembic upgrade head`), aucune migration existante touchée.

## 3. Tests ajoutés

| Fichier | Tests |
|---|---|
| `test_whatsapp_messages.py::TestUnknownSenderThreadIsolation` | 6 (unknown_number_A/B, réutilisation, hash≠clair, masque≠clair, parent connu inchangé) |
| `test_idempotency.py::TestConcurrentInsertProtection` | 1 (double insert concurrent impossible) |
| `test_idempotency.py::TestPurgeExpiredIdempotencyKeys` | 1 (purge des clés expirées) |
| `test_communication_messages_idempotency.py` | 3 (même clé même corps, même clé corps différent → 409, sans clé) |
| `src/hooks/__tests__/useOfflineSync.test.ts` | 5 (grade draft queued/sync success/conflict 409 ×2/erreur réseau) |
| `src/queries/__tests__/communication.test.tsx` | 4 (message queued offline, refus non-réseau non mis en file, reply-whatsapp queued offline, dedupe avant sync) |
| `src/offline/__tests__/outbox.test.ts` (étendu) | +4 (SYNCED visible, conflit 409 visible, refus non-409 distingué, erreur réseau → PENDING) |

## 4. Résultats des tests

- Tests ciblés du brief (audit logs, webhook, messages, reply, monitoring, idempotency, tenant isolation, token lifecycle, communication messages, grades, invoices) : **112/112**
- Suite backend complète (`pytest tests/ -v`, Postgres réel) : **777/787** — 10 échecs = `test_backup_scripts.py`, scripts shell Linux non exécutables nativement sur cet hôte Windows de développement, confirmé pré-existant et sans rapport avec ce changement
- Frontend `type-check` : ✅
- Frontend `lint` : ✅ (0 erreur, 2149 warnings — sous le budget CI documenté de 2182)
- Frontend `test -- --run` : **170/170** (157 avant cette session + 13 nouveaux)
- Frontend `build` : ✅
- Docker `compose config` : ✅ · `/health/live` : ✅ 200 · `/health/ready` : ✅ 200 (`database: connected, cache: connected, rls: active`)

## 5. Statut par point du brief

- **Conversations WhatsApp inconnues** : corrigé et testé — deux inconnus ne partagent plus jamais un thread ; numéro jamais stocké en clair (hash + masque uniquement).
- **Documentation WhatsApp** : à jour, reflète l'état réel du code (plus de contradiction).
- **Idempotence DB** : contrainte unique désormais appliquée aussi bien en test (SQLite) qu'en production (Postgres) ; purge automatisée en place.
- **Validation production réelle** : documentée honnêtement — ce qui est vérifiable depuis cet environnement l'a été (santé Docker), le reste (Render/Resend/Meta réels) reste explicitement marqué comme nécessitant un accès humain.
- **Offline notes/messages** : parcours complet avec statuts visibles et conflits affichés clairement — plus de disparition silencieuse d'un brouillon en conflit.

## 6. P0 / P1 / P2 restants

### P0 trouvé et corrigé cette session
- **Conflit 409 traité comme succès silencieux** dans la file offline legacy (présence/notes) — un brouillon en conflit d'idempotence disparaissait sans jamais informer l'utilisateur, potentiellement en lui faisant croire qu'une note/présence était enregistrée alors qu'elle ne l'était pas. Corrigé, testé (regression guard explicite dans les tests).

### P0 restants
Aucun détecté à l'issue de cette session.

### P1
- Les deux systèmes de file offline (legacy `src/lib/offlineDb.ts` pour présence/notes, nouveau `src/offline/` pour messages/WhatsApp) restent non unifiés — décision assumée (risque de fusion trop élevé dans le temps imparti), documentée dans le rapport de la session précédente. Reste à planifier pour une session dédiée.
- Absence/notes/bulletin (notifications WhatsApp) toujours sur le chemin synchrone, pas encore migré vers Arq comme les paiements (documenté dans `docs/WHATSAPP_NOTIFICATIONS.md`).

### P2
- `test_backup_scripts.py` ne peut pas s'exécuter nativement sur ce poste Windows (scripts shell Linux) — fonctionnera normalement sur Render/CI Linux.
- Aucun template Meta créé/approuvé — bloque tout envoi WhatsApp proactif réel hors fenêtre 24h (action business, pas technique).

## 7. Verdicts

- **Pilote payant encadré** : ✅ toujours prêt — aucune régression, un vrai bug de fiabilité offline corrigé.
- **Commercialisation large maîtrisée** : ✅ prêt — la distinction des inconnus WhatsApp et la fiabilité offline renforcent la confiance multi-établissements ; validation Render/Resend/Meta réelle reste à exécuter par un humain avec accès.
- **Déploiement national (1000+ établissements)** : 🟡 inchangé par rapport au rapport précédent — recommandations toujours valables (unifier les deux files offline, exécuter les checklists réelles, créer/approuver les templates Meta) avant un rollout à grande échelle.
