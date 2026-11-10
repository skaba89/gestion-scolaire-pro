# Travaux restants — ordre de criticité

Mis à jour le 2026-11-09 (après #499, recette des portails). Une ligne = un défaut ou un manque **constaté** dans le
code, ou une preuve absente. Voir `PROJECT_READINESS.md` pour la matrice.

| # | Priorité | Sujet | Constat | Critère d'acceptation |
|---|---|---|---|---|
| 1 | ~~P1~~ corrigé | Onglet « Analyse des résultats » (page Bulletins) | **Corrigé** (PR fix/report-analytics-official) : statistiques issues de la synthèse officielle de la période (moyennes du bulletin, seuil de réussite du niveau, matières par identifiant) ; plus aucune requête de notes par élève ; médiane exacte | — |
| 2 | P2 | Couleurs de moyenne de la page Bulletins | Seuils 10/14 écrits en dur alors que les règles académiques sont réglables par niveau (#496) | Couleurs dérivées des règles effectives |
| R1 | ~~P0~~ corrigé | Portail parent inutilisable | **Corrigé** (PR fix/parent-portal-invoice-reminders) : réponse paginée lue correctement, impayés PENDING/PARTIAL/OVERDUE, reste à payer affiché. Portail parent parcouru : 8 entrées, 0 défaut | — |
| R6 | P2 | Rappels de devoirs (ReminderSystem) | La requête lit `GET /students/` (paginée, et refusée à l'élève) comme un tableau : les rappels de devoirs restent toujours vides, sans erreur | Source élève/inscription correcte et test |
| R2 | ~~P0~~ corrigé | Tableau de bord étudiant en erreur 500 | **Corrigé** (PR fix/student-dashboard-sql) : jointure classe/niveau sur le schéma réel, statut `ACTIVE`, filtre établissement sur toutes les requêtes, année en cours prioritaire. Portail étudiant parcouru : 7 entrées, 0 défaut | — |
| R3 | ~~P0~~ corrigé | Portail chef de département en erreur 500 | **Corrigé** (PR fix/department-portal-sql) : tableau de bord (`attendance.classroom_id`), classes (`section` inexistante, renvoyée à null), emploi du temps (table `schedule`) ; 6 requêtes comparaient le statut à `active` (élèves et rapports toujours vides) ; activités récentes limitées aux élèves du département (elles listaient les notes de tout l'établissement). Portail parcouru : 11 entrées, 0 défaut | — |
| R4 | ~~P1~~ corrigé | Redirections ALUMNI / SECRETARY | **Corrigé** (PR fix/role-redirects) : règle unique `src/lib/roleRedirect.ts` utilisée par les gardes et par la connexion ; ALUMNI → /alumni, SECRETARY → /admin, chef de département directement sur /department | — |
| R5 | ~~P2~~ traité | « Marketplace Éducatif » sans API | **Retiré** (PR chore/hide-unbuilt-marketplace) : entrée de menu, route, page et requête vers `/library/marketplace/` (inexistante) ; case « Partager sur le Marketplace global » masquée (`is_public` n'était lu nulle part). Un vrai partage entre établissements demanderait un cadrage produit et sécurité (lecture inter-tenant, RLS) | Décision produit avant toute réintroduction |
| 4 | ~~P1~~ fait | Offline — scénario coupure / reprise | **Fait** : parcours E2E 11 (réseau coupé, saisie, correction, retour du réseau : une seule présence, au dernier statut) | — |
| O1 | ~~P1~~ corrigé | Données hors ligne après déconnexion | **Corrigé** (PR fix/offline-logout-purge) : toutes les bases IndexedDB vidées (élèves en cache, brouillons, ancienne base) ; envoi tenté avant la déconnexion, pertes annoncées. Parcours E2E 10 : 10 lignes restaient avant correctif, 0 après | — |
| O2 | ~~P1~~ corrigé | Envoi interrompu jamais repris | **Corrigé** : file et brouillons remis en attente (même clé d'idempotence) | — |
| O3 | ~~P1~~ corrigé | Plafond de la file | **Corrigé** : file pleine de saisies non envoyées → nouvelle saisie refusée avec message ; place libérée seulement sur l'historique déjà tranché | — |
| O4 | ~~P1~~ corrigé | Changement d'établissement | **Corrigé** : actions d'un autre établissement jamais envoyées ici, mais conservées | — |
| O5 | ~~P2~~ corrigé | Utilisateur non vérifié à l'envoi | **Corrigé** : seules les actions de l'utilisateur courant sont envoyées | — |
| O6 | ~~P1/P2~~ corrigé (sauf E) | Couches hors ligne | **Corrigé** (PR fix/offline-roster-and-indicator) : (A) la liste hors ligne d'une classe vient de ses inscriptions — l'ancien cache prenait la page 1 des élèves de l'établissement ; (B) l'indicateur global compte les vraies saisies en attente et « Synchroniser » les envoie — il comptait une file vide et « synchronisait » en supprimant ; (C) page Installer idem ; (D) `usePWA`, `useOfflineStorage`, `lib/db.ts` et requêtes mortes de `reference-data.ts` retirés, ancienne base supprimée si vide | — |
| O7 | P2 | Deux chemins de saisie de présence | File d'envoi (réseau perdu pendant une requête) et brouillons (écran hors ligne) coexistent ; tous deux robustes et testés | Fusion éventuelle, non urgente |
| 5 | ~~P2~~ fait | Code mort au contrat invalide | **Retiré** avec O6 (`reference-data.ts` : `students`, `teachers`) | — |
| 6 | P2 | `test_start_sh_db_resolution.py` | 8 échecs en local (Python système 3.14, pas de `python`) ; verts en CI | Test indépendant de l'interpréteur de l'hôte |



## Recette B2 — admissions (2026-11-09)

| # | Priorité | Sujet | Constat | Critère d'acceptation |
|---|---|---|---|---|
| A1 | ~~P0~~ corrigé | Conversion candidature → élève | **Corrigé** (PR fix/admission-convert) : 500 sur PostgreSQL pour CHAQUE conversion (INSERT brut sans `id`) ; matricule « nombre + 1 » en collision (unicité globale entre écoles) ; date de naissance inventée ; pas de verrou (double conversion). ORM, verrou, matricule libre par essais, date exigée | — |
| A2 | — | ~~Matricule unique sur toute la plateforme~~ **corrigé** | Migration `20261110_0001` : index global retiré, unicité par établissement conservée ; import CSV : `ON CONFLICT (tenant_id, registration_number)` et ligne non insérée signalée (elle était comptée « créée ») ; conflit simultané à la création → 400 au lieu de 500. À déployer (migration) | — |
| A3 | — | ~~Conversion sans lien parent~~ **corrigé** | La conversion rattache le parent (compte PARENT de l'établissement trouvé par e-mail, sinon compte en attente à activer dans « Utilisateurs en attente ») dans la même transaction ; jamais un compte d'un autre établissement ; réservé à `settings:write` (le secrétariat convertit sans créer de compte) ; résultat `parent_link` dans la réponse | — |
| A4 | ~~P1~~ fait | Parcours B2 restants | **Joués sur la vraie stack** : préinscription publique, transfert de classe (retrait puis réinscription, doublon refusé), changement d'année : sains. Réinscription : défaut RE-01 corrigé. Parcours E2E 13 | — |
| RE-01 | ~~P1~~ corrigé | Réinscription en double | **Corrigé** (PR fix/reenrollment-no-duplicate) : valider une réinscription créait un second élève ; la demande est désormais rattachée à l'élève existant (revérifié dans l'établissement) | — |
| A5 | — | ~~Transfert non atomique~~ **corrigé** | `POST /enrollments/{id}/transfer/` : retrait et nouvelle inscription dans une seule transaction (ancienne inscription TRANSFERRED) ; action « Changer de classe » ; le choix de classe en modification d'élève, sans effet jusqu'ici, est désactivé avec un renvoi | — |


## Recette B6 — finances (2026-11-09)

| # | Priorité | Sujet | Constat | Critère d'acceptation |
|---|---|---|---|---|
| F1 | ~~P0~~ corrigé | Parent qui solde lui-même une facture | **Corrigé** (PR fix/payment-webhook-idempotence) : `POST /parents/payments/create/` avec CASH/BANK_TRANSFER créditait la facture (COMPLETED) pour un simple parent ; réservé désormais à `payments:write`. Présent depuis le 2026-04-25 ; **impact en production non vérifié** (lecture refusée) — requête de contrôle dans la PR | Contrôle des paiements CASH/BANK_TRANSFER enregistrés par des parents en production |
| F2 | ~~P1~~ corrigé | Paiement perdu du solde | **Corrigé** : confirmations simultanées (plusieurs workers) → un paiement disparaissait du solde de la facture (lecture-écriture) ; verrou, passage PENDING→COMPLETED conditionnel, incrément calculé par la base | — |
| F3 | ~~P2~~ corrigé | Paiement en ligne non rapprochable | **Corrigé** : échec d'enregistrement du paiement PENDING masqué, URL de paiement renvoyée quand même ; désormais 502 | — |
| F4 | ~~P2~~ corrigé | Données personnelles dans les journaux | **Corrigé** : contenu complet des webhooks journalisé ; seule la référence l'est désormais | — |
| F5 | P2 | Signature PayTech partielle | Le HMAC PayTech ne couvre que `ref_command` (format du fournisseur) ; montant contrôlé côté serveur | Vérifier les champs signés disponibles chez PayTech |
| F6 | P2 | Recette B6 restante | Annulation et export CSV couverts (parcours 15, aucun défaut trouvé) ; reste CinetPay, non testable sans sandbox | Accès sandbox CinetPay |

## Qualité de la chaîne CI (2026-11-09)

| # | Priorité | Sujet | Constat | Critère d'acceptation |
|---|---|---|---|---|
| C1 | P1 | E2E non obligatoire | Le ruleset `protect-main` exige 5 contrôles ; « E2E Journeys (real stack) » ne l'est pas | Contrôle requis (validation humaine : modification de la protection de branche) |
| C2 | ~~P1~~ corrigé | Test instable | **Corrigé** (PR test/stabilize-websocket-revocation) : course du `TestClient` Starlette à la fermeture (annulation avant la fin de l'endpoint) ; 8 échecs sur 15 avant, 0 sur 30 après | — |
| C3 | P2 | Run `main` incomplet | Sur `7b072ea`, GitHub n'a jamais créé Backend ni Browser Smoke (deux tentatives) ; arbre identique au commit de PR vert 6/6 | Surveiller ; relancer par un nouveau commit si cela se reproduit |
| C4 | P1 | Production en retard | 100 commits non déployés (#498–#509 compris) | Déploiement validé, sauvegarde préalable, plan de retour arrière |

Points hors périmètre automatisé, nécessitant une décision humaine : déploiement
en production, recette sur appareils réels, environnement sandbox Mobile Money,
test de charge sur une copie de production.
