# Runbook Support — SchoolFlow Pro

Procédures opérationnelles pour l'équipe support. Chaque procédure
référence l'endpoint ou l'outil réel — pas de procédure inventée.

## Comment créer une école

Deux chemins possibles :
1. **Le client s'inscrit lui-même** via `/inscription` (le chemin normal, aucune action support requise).
2. **Le support crée pour le compte du client** (cas d'assistance) : utiliser un compte `SUPER_ADMIN`, endpoint `POST /tenants/` (authentifié), en renseignant nom, slug, type, pays.

Ne jamais créer un tenant directement en base — toujours passer par
l'API pour garantir la cohérence (settings par défaut, RLS, etc.).

## Comment réinitialiser un mot de passe

1. Le chemin normal : l'utilisateur utilise `POST /auth/reset-password/` (self-service, envoie un lien par email).
2. Si l'utilisateur n'a plus accès à son email : un admin de son établissement peut forcer un changement via `must_change_password` sur le compte utilisateur, qui déclenche `POST /auth/reset-forced-password/` à la prochaine connexion.
3. Cas du tout premier super-admin oublié : `POST /auth/bootstrap/` — nécessite le secret `BOOTSTRAP_SECRET` (jamais à communiquer par un canal non sécurisé), refuse s'il existe déjà un `SUPER_ADMIN` (usage unique).

**Ne jamais** modifier un mot de passe directement en base de données —
toujours passer par l'API pour garantir le bon hachage (bcrypt) et
l'historique de mots de passe (anti-réutilisation).

## Comment vérifier un paiement

1. `GET /payments/?student_id={id}` pour l'historique d'un élève.
2. `GET /payments/{id}/receipt/` pour le reçu exact avec son numéro de référence.
3. Chaque paiement a un statut (`PENDING`/`COMPLETED`/`FAILED`/`REFUNDED`/`REVERSED`) — un paiement en ligne resté `PENDING` signifie que le webhook du fournisseur (CinetPay/PayTech) n'a pas encore confirmé, ou a échoué silencieusement côté fournisseur (vérifier les logs applicatifs pour `CinetPay webhook received`/`PayTech`).

## Comment annuler un paiement

`POST /payments/{id}/reverse/` avec une note obligatoire expliquant la
raison. **Ne jamais supprimer un paiement** — l'annulation est la seule
voie, elle est tracée et auditée automatiquement (`log_audit`), et la
facture liée est recalculée automatiquement (`paid_amount` décrémenté,
statut réajusté).

## Comment importer des élèves

1. Télécharger le modèle : `GET /import/students/template/`.
2. Faire remplir le fichier par le client (colonnes documentées dans `docs/IMPORT_EXCEL_READINESS.md`).
3. Envoyer à `POST /import/students/preview/` pour valider avant import réel — vérifier `has_errors` et `required_missing` dans la réponse.
4. Si tout est correct (ou avec `skip_errors=true` si le client accepte d'ignorer les lignes en erreur), envoyer à `POST /import/students/confirm/`.
5. L'import Enseignants/Parents n'est pas encore disponible — voir `docs/IMPORT_EXCEL_READINESS.md` pour le contournement manuel en attendant.

## Comment diagnostiquer un problème de connexion (login)

1. Vérifier que le compte existe et n'est pas verrouillé (`test_account_lockout.py` documente le comportement : verrouillage après N tentatives échouées).
2. Vérifier `GET /health/ready` — si `database`/`cache` ne sont pas `connected`, le problème est infrastructurel, pas côté utilisateur.
3. Si l'utilisateur dit "j'étais connecté puis déconnecté soudainement" : vérifier si un logout-all a été déclenché (volontaire ou changement de mot de passe récent — les deux invalident toutes les sessions).
4. Si MFA est activé et l'utilisateur a perdu son appareil : voir la procédure MFA dédiée (hors périmètre de ce runbook — nécessite une vérification d'identité manuelle avant tout contournement).

## Comment diagnostiquer une lenteur

1. `GET /health/ready` — vérifier que tous les composants (`database`, `cache`, `storage`) sont `connected`, pas seulement `alive`.
2. Vérifier les logs applicatifs pour des requêtes lentes répétées (le format de log structuré inclut `request_id` et `tenant_id` — filtrer sur le tenant concerné).
3. Vérifier si le tenant a un volume de données inhabituel (nombre d'élèves, historique de notes) qui pourrait justifier une requête plus lente sur des KPI non filtrés par période — voir la note de vigilance dans `docs/DIRECTION_DASHBOARD_READINESS.md`.
4. Si la lenteur touche tous les tenants simultanément : vérifier l'état de PostgreSQL/Redis directement (connexions actives, CPU) — probablement infrastructurel, pas applicatif.

## Comment vérifier l'état de santé (health)

```
curl -i http://<host>/health/live    # la plateforme répond-elle du tout ?
curl -i http://<host>/health/ready   # la plateforme est-elle réellement fonctionnelle ?
```

`/health/ready` retourne le statut détaillé de chaque dépendance
(`database`, `cache`, `rls`, `storage`). Un `200` avec tous les
composants `connected`/`active` = tout va bien. Un composant
`unreachable` = incident à escalader immédiatement (voir ci-dessous).

## Comment vérifier les logs

Logs structurés en JSON, incluant systématiquement `request_id`,
`tenant_id`, `user_id`, `timestamp`, `level`. Filtrer par `tenant_id`
pour isoler les logs d'un établissement spécifique lors d'un ticket
support. Les logs d'audit (mutations sensibles : paiements, imports,
suppressions) sont accessibles via `GET /audit/` (authentifié, permission
`audit:read`) — préférer cet endpoint aux logs bruts pour toute question
"qui a fait quoi" côté client.

## Comment escalader un incident

| Sévérité | Exemple | Action |
|---|---|---|
| **P1 — Critique** | `/health/ready` retourne `unreachable`, plateforme inaccessible pour tous les tenants, perte de données suspectée | Escalade immédiate à l'équipe technique, ne pas attendre le prochain point d'équipe |
| **P2 — Majeur** | Un tenant spécifique ne peut pas se connecter, un module clé (paiement, bulletin) est en erreur pour un client | Escalade sous la journée, suivre le délai du SLA applicable (`docs/SLA.md`) |
| **P3 — Mineur** | Anomalie visuelle, comportement inattendu sans blocage | Ticket standard, traité selon le SLA |

Avant toute escalade technique, rassembler : `tenant_id` concerné,
`request_id` d'un appel en échec si disponible, capture d'écran ou
message d'erreur exact, heure précise de l'incident (fuseau
Africa/Conakry).

**Ne jamais** : redémarrer la base de données, exécuter une migration,
ou modifier des données directement en production sans validation de
l'équipe technique — même en cas d'urgence perçue. Une action mal
maîtrisée en production peut transformer un incident mineur en incident
majeur.
