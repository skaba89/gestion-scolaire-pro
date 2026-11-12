# Travaux restants — ordre de criticité

Mis à jour le 2026-11-09 (après #499, recette des portails). Une ligne = un défaut ou un manque **constaté** dans le
code, ou une preuve absente. Voir `PROJECT_READINESS.md` pour la matrice.

| # | Priorité | Sujet | Constat | Critère d'acceptation |
|---|---|---|---|---|
| 1 | ~~P1~~ corrigé | Onglet « Analyse des résultats » (page Bulletins) | **Corrigé** (PR fix/report-analytics-official) : statistiques issues de la synthèse officielle de la période (moyennes du bulletin, seuil de réussite du niveau, matières par identifiant) ; plus aucune requête de notes par élève ; médiane exacte | — |
| 2 | ~~P2~~ corrigé | Couleurs de moyenne de la page Bulletins | **Corrigé** (PR fix/report-card-average-colors) : `class-summary` renvoie `items[].color`, calculée par `grade_color` avec les règles du niveau (même couleur que le bulletin PDF, ambre compris) ; la page n'a plus de seuil en dur | — |
| R1 | ~~P0~~ corrigé | Portail parent inutilisable | **Corrigé** (PR fix/parent-portal-invoice-reminders) : réponse paginée lue correctement, impayés PENDING/PARTIAL/OVERDUE, reste à payer affiché. Portail parent parcouru : 8 entrées, 0 défaut | — |
| R6 | ~~P2~~ corrigé | Rappels de devoirs (ReminderSystem) | **Corrigé** (PR fix/homework-reminders-source) : les rappels lisent les devoirs à venir de `GET /students/dashboard/`, même requête et même cache que l'accueil élève ; plus d'appel à `/students/`, `/enrollments/`, `/homework/` ; jamais appelé pour un parent | — |
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
| 6 | ~~P2~~ corrigé | `test_start_sh_db_resolution.py` | **Corrigé** (PR test/start-sh-interpreter) : `start.sh` appelle `python`, absent de certains hôtes ; le faux `PATH` du test fournit `python` → interpréteur des tests (script, pas lien : un lien perd le venv). 12/12 avec ou sans `python` sur l'hôte | — |



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
| F5 | — | ~~Signature PayTech~~ **corrigé** | Le contrôle attendait un HMAC de `ref_command` seul dans un champ `hash` / en-tête `x-paytech-hash` que PayTech n'envoie pas : toute vraie notification était rejetée (aucun paiement PayTech crédité). Désormais `hmac_compute` = HMAC-SHA256(secret, `montant\|ref_command\|api_key`) selon la documentation PayTech ; repli par hachages fixes des clés refusé (rejouable) ; montant contrôlé = montant signé. Production vérifiée le 2026-11-10 : aucune école sur PayTech, aucune notification reçue | Premier paiement réel avec un établissement pilote |
| F6 | P2 | Recette B6 restante | Annulation et export CSV couverts (parcours 15, aucun défaut trouvé) ; reste CinetPay, non testable sans sandbox | Accès sandbox CinetPay |

## Contrat frontend → API (2026-11-11)

| # | Priorité | Sujet | Constat | Critère d'acceptation |
|---|---|---|---|---|
| RDV | ~~P1~~ corrigé | Rendez-vous parents-enseignants | **Corrigé** (PR fix/appointments-end-to-end) : la fonction n'avait jamais marché — création de créneau refusée (`slot_date` / `date`), réservation en échec sur PostgreSQL (`:appointment_date::date`), génération de semaine, confirmation et annulation vers des routes absentes, double réservation possible, liste parent toujours vide (page lue comme tableau), tous les rendez-vous de l'établissement visibles par tout enseignant, erreurs avalées. Service `app/services/appointments.py`, créneau verrouillé à la réservation, transitions contrôlées ; parcours E2E 16 | — |
| API-UNBUILT | ~~P2~~ traité | Fonctions jamais construites côté serveur | **Retirées** (PR chore/remove-unbuilt-pages) : parrainages, plans de réussite, signatures électroniques, tableau de bord exécutif / prévisions de trésorerie (pages sans route), visioconférences (route sans lien de menu), `cashFlowForecasting.ts` et `pedagogicalEngine.ts` (importés nulle part) — ~2 400 lignes, aucun changement visible. Appels sans route : 25 → 9 (défauts réels restants : exports, mentorat, commandes, e-learning ; plus un faux positif) | Décision produit avant toute réintroduction (tables, migration, endpoints, permissions) |

## Exports et carrières (2026-11-11)

| # | Priorité | Sujet | Constat | Critère d'acceptation |
|---|---|---|---|---|
| EXP | ~~P1~~ corrigé | Exports avancés | **Corrigé** (PR fix/exports-and-mentoring) : Enseignants sur `/users/?role=TEACHER` + affectations `/teachers/` (au lieu de `/hr/staff/`, 404) ; toutes les pages lues (`fetchAllPages`) ; paramètres réels (`classroom_id`, `classId`/`termId`) ; colonnes Tuteur remplies ; Emploi du temps implémenté ; échec affiché avec sa raison. Colonne Téléphone retirée de l'export Enseignants (donnée absente de l'API) | — |
| CAR | ~~P1~~ corrigé | Candidatures et mentorat | **Corrigé** : fiche élève de l'appelant trouvée par `students.user_id` (l'identifiant du compte était écrit dans `student_id`, clé étrangère vers `students` → échec pour tout vrai compte ; les tests confondaient les deux) ; statut imposé « PENDING » à la création ; statuts normalisés en majuscules ; erreurs plus avalées ; nouvelle route `PATCH /alumni/admin/mentorship-requests/{id}/` (`users:write`) | — |

## Historique des commandes (2026-11-11)

| # | Priorité | Sujet | Constat | Critère d'acceptation |
|---|---|---|---|---|
| ORD | ~~P2~~ corrigé | Reçu et suppression de vente | **Corrigé** (PR fix/order-history) : `GET /inventory/orders/{id}/items/` (`inventory:read`) ; corbeille → annulation confirmée `POST /inventory/orders/{id}/cancel/` (`inventory:write`) : statut CANCELLED, remise en stock, audit, seconde annulation refusée (409), autre établissement 404. Pas de suppression physique | — |

## Non-régression des lectures (2026-11-11)

| # | Priorité | Sujet | Constat | Critère d'acceptation |
|---|---|---|---|---|
| CRAWL | ~~P2~~ fait | Erreurs 500 sur des lectures invisibles des tests | **Fait** (PR ci/get-routes-crawl) : parcours de toutes les routes GET × 9 rôles dans le job E2E, échec sur toute 5xx. Un premier parcours manuel a trouvé `event-registrations` (#531) | — |
| CRAWL-W | ~~P2~~ fait | Écritures non parcourues | **Fait** : parcours exploratoire (53 opérations en 5xx) → #533 (FK d'un autre établissement, ≈25 routes), #534 (pannes), #535 (saisies → 422), puis parcours des écritures dans la CI avec liste de référence vide (`scripts/ci/crawl_write_routes.py`) | — |

## E-learning (2026-11-11)

| # | Priorité | Sujet | Constat | Critère d'acceptation |
|---|---|---|---|---|
| ELN-AI | ~~P1~~ corrigé | Faux contenu IA | **Corrigé** (PR fix/elearning-routes) : `POST /ai/generate/` renvoyait un texte et un QCM fictifs présentés comme générés ; route et boutons « Assistant IA » retirés | — |
| ELN-DISC | ~~P2~~ corrigé | Discussions de cours | **Corrigé** : `CourseDiscussions.tsx` jamais affiché (retiré, avec ses appels PATCH/DELETE sans route) ; accueil élève : auteur et cours enfin affichés, messages principaux seulement (`top_level`) ; erreurs plus avalées | — |
| ELN-PERSIST | ~~P2~~ fait | Leçons non enregistrées | **Fait** (PR feat/elearning-lessons) : tables `elearning_lessons` / `elearning_lesson_progress`, RLS sur les modules, routes personnel + élève, page « Mes cours ». Reste éventuel : quiz, génération IA réelle | — |

## Qualité de la chaîne CI (2026-11-09)

| # | Priorité | Sujet | Constat | Critère d'acceptation |
|---|---|---|---|---|
| C1 | ~~P1~~ fait | E2E non obligatoire | **Fait le 2026-11-11** (validation humaine) : « E2E Journeys (real stack) » ajouté aux contrôles requis du ruleset `protect-main` (6 contrôles). Job sans filtre de chemins, donc exécuté sur toute PR ; 30 derniers runs : 27 succès (dont 1 au 2ᵉ essai), 2 annulés, 0 échec | — |
| C2 | ~~P1~~ corrigé | Test instable | **Corrigé** (PR test/stabilize-websocket-revocation) : course du `TestClient` Starlette à la fermeture (annulation avant la fin de l'endpoint) ; 8 échecs sur 15 avant, 0 sur 30 après | — |
| C3 | P2 | Run `main` incomplet | Sur `7b072ea`, GitHub n'a jamais créé Backend ni Browser Smoke (deux tentatives) ; arbre identique au commit de PR vert 6/6 | Surveiller ; relancer par un nouveau commit si cela se reproduit |
| C4 | ~~P1~~ fait | Production en retard | **Rattrapée** : 5 déploiements validés du 2026-11-09 au 2026-11-11, chacun avec sauvegarde préalable ; production en `81eaf4a` (#519) | — |

Points hors périmètre automatisé, nécessitant une décision humaine : déploiement
en production, recette sur appareils réels, environnement sandbox Mobile Money,
test de charge sur une copie de production.
