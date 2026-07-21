# Modèle analytique — Cadrage (Phase 5 / issue #22, PR 1)

Ce document cadre le futur entrepôt analytique de SchoolFlow Pro **avant**
d'écrire la moindre vue ou migration. Il répond à la question "sur quoi
va-t-on construire les dashboards BI et l'IA prédictive" pour que les PR
suivantes (vues Postgres, endpoints API, IA éducative) partagent le même
vocabulaire, au lieu que chacune invente ses propres agrégats.

Aucun code n'est ajouté par ce document — c'est volontaire (voir découpage
en PR dans l'issue #22).

## Objectif

Donner à chaque établissement (et, en vue agrégée/anonymisée, au ministère)
des indicateurs fiables sur : présence, réussite scolaire, situation
financière, charge enseignants, risque de décrochage — sans jamais exposer
les données d'un tenant à un autre, ni les PII dans une vue institutionnelle.

## Principe directeur : vues, pas de nouvel entrepôt séparé (pour l'instant)

Périmètre §8 de l'issue propose 3 options (vues matérialisées Postgres, dbt,
Airflow+warehouse séparé). Recommandation pour cette phase : **Option 1
(vues/vues matérialisées PostgreSQL)**, réévaluée seulement si la volumétrie
ou la latence des dashboards le justifie. Raisons :

- Zéro nouvelle infra (pas de dbt, pas d'Airflow) — cohérent avec la règle
  "ne pas imposer un nouveau service obligatoire".
- RLS existante (`app.current_tenant_id`) s'applique nativement à une vue
  Postgres classique — une vue non matérialisée hérite du filtre RLS de ses
  tables sources sans travail supplémentaire.
- Une vue matérialisée peut être rafraîchie par un simple `REFRESH
  MATERIALIZED VIEW CONCURRENTLY` déclenché par cron/Celery plus tard, sans
  changer le modèle une fois choisi.

## Dimensions

| Dimension | Source (table réelle) | Colonnes clés |
|---|---|---|
| Tenant | `tenants` | `id`, `name`, `slug`, `type`, `subscription_plan` |
| Campus | `campuses` | `id`, `tenant_id`, `name` |
| Niveau | `levels` | `id`, `tenant_id`, `name`, `order_index` |
| Classe | `classes` | `id`, `tenant_id`, `level_id`, `name` |
| Matière | `subjects` | `id`, `tenant_id`, `name`, `coefficient` |
| Année académique | `academic_years` | `id`, `tenant_id`, `name`, `start_date`, `end_date`, `is_current` |
| Élève | `students` | `id`, `tenant_id`, `registration_number`, `status`, `gender`, `date_of_birth` |
| Enseignant | `users` + `user_roles` (role='TEACHER') | `id`, `tenant_id` |
| Parent | `users` + `user_roles` (role='PARENT') via `parent_student` | `id`, `tenant_id` |
| Statut paiement | `payments.status`, `invoices.status` | enum (`PENDING`, `PAID`, `OVERDUE`, ...) |

Toutes ces tables portent déjà `tenant_id` (TenantMixin) et sont déjà
protégées par RLS (cf. `backend/app/core/operational_tables.py` et les
migrations `*_rls*`) — aucune dimension supplémentaire de sécurité à ajouter,
la RLS existante suffit tant qu'on reste en vues (pas de copie physique hors
RLS).

## Faits

| Fait | Table source | Grain | Mesures |
|---|---|---|---|
| Inscriptions | `enrollments` | 1 ligne / élève / année / classe | count, `status` |
| Présences | `attendance` | 1 ligne / élève / date / (matière, classe) | count par `status` (PRESENT/ABSENT/LATE/EXCUSED) |
| Notes | `grades` | 1 ligne / élève / évaluation | `score`, `max_score`, `coefficient` |
| Factures | `invoices` | 1 ligne / facture | `total_amount`, `paid_amount`, `status`, `due_date` |
| Paiements | `payments` | 1 ligne / paiement | `amount`, `currency`, `payment_method`, `status` |
| Admissions | `admissions` (voir `backend/app/models/admission.py`) | 1 ligne / candidature | `status` |
| Incidents | `incidents` (table opérationnelle, voir `operational_tables.py`) | 1 ligne / incident | `severity`, `status` |
| Connexions | `business_events_total{event="login"}` (Prometheus, pas SQL) | — | déjà couvert par la Phase 3 (métriques), pas dupliqué ici |

## Indicateurs clés (KPI) — définition, pas encore implémentés

| KPI | Formule (sur les faits ci-dessus) |
|---|---|
| Taux de présence | `PRESENT / (PRESENT + ABSENT + LATE)` sur `attendance`, filtré par période |
| Taux d'absentéisme | `ABSENT / total` sur `attendance` |
| Moyenne pondérée | `SUM(score/max_score * coefficient) / SUM(coefficient)` sur `grades`, groupé par classe/matière/campus |
| Taux de réussite | part des élèves avec moyenne ≥ seuil configurable (actuellement pas de colonne "seuil de passage" — à ajouter si besoin, hors scope PR1) |
| Taux d'impayés | `SUM(invoices.total_amount - invoices.paid_amount) / SUM(invoices.total_amount)` sur factures échues (`due_date < now()`) |
| Recouvrement financier | `SUM(payments.amount WHERE status='PAID') / SUM(invoices.total_amount)` |
| Charge enseignant | nombre de classes/matières assignées (`teacher_assignments`, table opérationnelle) par enseignant |
| Risque décrochage | règles simples au départ (§6 de l'issue) : combinaison taux de présence bas + moyenne en baisse + factures impayées — voir section ML ci-dessous |
| Évolution des inscriptions | `COUNT(enrollments)` par année académique, tendance |

## IA éducative & ML — approche MVP (§5/§6 de l'issue)

Conformément à l'issue : **"Modèle simple au départ : règles + features
SQL"**. Aucun modèle ML entraîné dans cette phase. Le scoring risque
décrochage démarre comme une requête SQL combinant les KPI ci-dessus avec
des seuils configurables par tenant (pas de dépendance scikit-learn/XGBoost
avant qu'un vrai besoin business le justifie — cohérent avec "ne pas
réécrire/complexifier sans nécessité").

Le résumé élève / assistant direction / assistant parent réutiliseront le
`groq_service` déjà en place (`backend/app/services/groq_service.py`,
fallback Groq → OpenRouter → Gemini → GLM) plutôt qu'un nouveau pipeline IA
— seul le prompt et les données injectées changent.

## Gouvernance et confidentialité (§7 de l'issue)

- **Vues tenant-scopées** : toute vue analytique interroge des tables déjà
  protégées par RLS → un utilisateur d'un tenant ne peut physiquement pas
  lire les lignes d'un autre tenant, même via une vue.
- **Vues institutionnelles (ministère)** : doivent agréger `GROUP BY` sur au
  moins `tenant_id` + une dimension (jamais de ligne au niveau élève) et
  exclure toute colonne PII (`first_name`, `last_name`, `email`, `phone`,
  `address`, `date_of_birth`). Ces vues nécessitent une revue de sécurité
  dédiée avant la PR 5 (dashboards ministère) — pas dans le périmètre PR 1.
- **Journalisation des exports** : réutiliser `log_audit()`
  (`backend/app/utils/audit.py`), déjà utilisé partout ailleurs dans le
  projet — pas de nouveau mécanisme de log à inventer.

## Prochaines étapes (PR suivantes de l'issue #22, non faites ici)

1. **PR 2** — Vues Postgres MVP pour un seul dashboard (direction
   établissement : élèves, présences, finances, notes), migration Alembic
   non destructive.
2. **PR 3** — Tests de qualité data (unicité, non-null, cohérence
   référentielle) sur les vues introduites en PR 2.
3. **PR 4** — Endpoints API exposant ces vues avec cache Redis court.
4. **PR 5** — Documentation de connexion Superset/Metabase + datasets.
5. **PR 6** — IA éducative MVP (résumé élève) via `groq_service` existant.

Chaque PR reste petite, ciblée et testable — pas de refonte en un seul
commit, conformément aux règles de sécurité de l'issue.
