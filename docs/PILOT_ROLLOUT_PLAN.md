# Plan de déploiement pilote — Academy Guinéenne

Plan pragmatique pour un premier déploiement réel avec des établissements
guinéens, basé sur ce qui est aujourd'hui vérifié fonctionnel (voir
critères de succès en fin de document) plutôt que sur une promesse.

## Étape 0 — Pré-requis avant tout pilote (bloquants)

- [ ] Vérifier le rôle PostgreSQL de production n'est pas superutilisateur
      (voir `docs/SECURITY_MODEL.md` §3) — sinon RLS n'isole rien en
      production.
- [ ] Sauvegarde automatique testée en conditions réelles (restauration
      complète sur un environnement de test, pas seulement en simulation).
- [ ] `SECRET_KEY`, `BOOTSTRAP_SECRET`, identifiants MinIO/Redis/Postgres de
      production générés et stockés hors dépôt (jamais les valeurs de
      `.env.example`).

## Étape 1 — Pilote fermé (1 à 3 établissements volontaires)

Objectif : valider le parcours commercial complet en conditions réelles,
pas seulement en test automatisé.

Parcours à valider avec un vrai directeur d'établissement (pas un compte
de test) :
1. Inscription (`/inscription`) et onboarding complet — vérifié
   fonctionnel jusqu'à l'étape 3/4 (établissement, compte, structure
   pédagogique/matières) lors de l'audit ; l'étape de signature manuscrite
   reste à valider manuellement (nécessite un tracé souris/tactile réel,
   non testable depuis un navigateur automatisé sans capture d'écran).
2. Création de niveaux/classes/matières.
3. Import ou saisie manuelle des élèves.
4. Création des enseignants et de leurs affectations
   (module vérifié par tests dédiés — CRUD, isolation tenant, pagination).
5. Saisie de présences et de notes.
6. Génération d'un bulletin (mode HTML → impression PDF navigateur,
   pattern déjà utilisé et fonctionnel).
7. Enregistrement d'un paiement et génération du reçu numéroté
   (`GET /payments/{id}/receipt/`).
8. Connexion et consultation côté portail parent (notes, absences,
   factures — accès déjà restreint aux enfants du parent connecté).

Durée suggérée : 2 à 4 semaines, avec un point hebdomadaire avec chaque
établissement pilote pour remonter les frictions réelles (pas seulement
les bugs).

## Étape 2 — Pilote élargi (10 à 20 établissements)

Ne démarrer qu'après résolution des retours de l'étape 1. Ajouter à ce
stade :
- Formation courte (guide admin/enseignant/parent — à finaliser, voir
  Phase 10 du plan commercial).
- Suivi actif du dashboard de monitoring (actuellement plateforme, pas
  encore ventilé par tenant — voir `docs/NATIONAL_SCALE_READINESS.md` §6 —
  à surveiller manuellement en attendant).
- Test réel d'un import Excel à volume significatif (centaines d'élèves)
  pour valider la fiabilité avant promesse commerciale sur ce point.

## Étape 3 — Industrialisation

Ne pas engager avant que :
- Le monitoring soit ventilé par tenant.
- Les gros consommateurs (bulletins en lot, imports, exports ministère)
  soient basculés sur l'infrastructure de jobs asynchrones déjà en place
  (voir `docs/ASYNC_JOBS_GUIDE.md`) plutôt que traités en synchrone dans la
  requête HTTP.
- Un test de montée en charge réel (pas seulement des tests unitaires) ait
  été mené avec un volume représentatif d'un déploiement national.

## Critères de succès pour passer d'une étape à la suivante

| Critère | Étape 0→1 | Étape 1→2 | Étape 2→3 |
|---|---|---|---|
| Aucun P0/P1 sécurité ouvert | requis | requis | requis |
| Onboarding complet testé manuellement | — | requis | requis |
| Multi-tenant testé avec 2+ tenants réels | — | requis | requis |
| Paiement réel (pas simulé) traité sans incident | — | — | requis |
| Backup/restore validé en conditions réelles | requis | — | — |
| Import Excel massif validé | — | — | requis |
| Monitoring par tenant en place | — | — | requis |

## Recommandation actuelle

Sur la base des vérifications menées à date de ce document : le produit
est **prêt pour un pilote fermé (Étape 1)**, sous réserve de la vérification
du rôle PostgreSQL de production (Étape 0, bloquant). Il n'est **pas
encore recommandé** de passer à l'Étape 2 tant que l'onboarding complet
(y compris signature) et un cas de paiement réel n'ont pas été validés
manuellement de bout en bout par un humain sur le produit réellement
déployé.
