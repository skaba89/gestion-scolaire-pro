# Audit initial — plateforme modulaire multi-établissements

Référence inspectée : `main` `c93f1aa8621c056e00b698a429e0e36effcae67e`, 2026-11-14.
Branche de travail : `feature/modular-education-platform`. Aucune production modifiée.

## Preuves exécutées avant implémentation

- Inventaire OpenAPI : **686 opérations** (313 GET, 207 POST, 80 DELETE,
  32 PATCH, 54 PUT), via `scripts/audit/export-openapi-ops.py`.
- PostgreSQL 16.2 jetable migré : **86 tests réussis** sur les presets des types,
  règles académiques, relevés, capitalisation ECTS, abonnements et permissions.
- Vitest : **14 tests réussis** (permissions, terminologie, SubscriptionGate).
- CI de #554 (référence de main) : six contrôles réussis, 3297 tests PostgreSQL
  réussis / 1 ignoré ; couverture backend 76,87 %. Ce n'est pas un score de maturité.

## Inventaire et classification

| Brique | État initial | Éléments réels / preuve | Réutilisation prévue |
|---|---|---|---|
| Authentification, RBAC, tenant, RLS | Fonctionnel et testé sur les scénarios exécutés | `core/security.py`, `core/database.py`, tests de permissions et CI PostgreSQL/E2E | Socle conservé ; un module n'accorde jamais un droit RBAC |
| Catalogue de modules métier | Absent | Aucun catalogue d'activation tenant/cycle, ni garde `require_module` dans le code inspecté | Introduire un catalogue, sans recréer les services métier |
| Types à la création | Présent mais partiel | `VALID_TENANT_TYPES` et inscription publique : primary/middle/high/university/training uniquement ; validation dupliquée | Neuf profils explicites et validation partagée |
| Maternelle / supérieur distinct / professionnel / mixte | Absent comme profils canoniques créables | Refusés par les schémas actuels de création ; des alias de terminologie existent seulement en lecture | Étendre sans réécrire le type des établissements existants |
| Niveaux guinéens | Fonctionnel et testé | `core/guinea_presets.py`, `test_tenant_type_level_presets.py` | Presets proposés, modifiables ; pas de suppression à un changement de profil |
| Notes, moyennes, mentions et bulletins | Fonctionnel sur les tests / configuration partielle | `services/academic_rules.py`, règles tenant puis niveau ; normalisation sur 20 ; tests PG/relevés | Réutiliser la hiérarchie existante ; ne pas prétendre gérer toutes les échelles |
| LMD / ECTS | Présent et testé partiellement | `Subject.ects`, `Semester`, `services/progression.py`, `transcripts.py` et capitalisation | Conserver crédits, semestres et relevés ; compensation/délibération complète non démontrée |
| UE/ECUE / parcours / diplômes | Présent mais partiel ou non vérifié | Matières/ECTS, programmes, certificats et relevés existent ; pas de preuve d'un moteur ECUE/compensation/diplômes complet dans ce lot | Étendre les ressources existantes après inventaire métier détaillé |
| Compétences maternelle/professionnel | Absent comme moteur métier identifié | Aucun référentiel/évaluation par compétences identifié dans les modèles/routes inspectés | Ne pas afficher comme activable une fonctionnalité non construite |
| Finances et abonnements | Fonctionnel et testé sur les scénarios exécutés | `plan_catalog.py`, tests d'abonnement ; toutes les offres actuelles ont `all_features: true` | Conserver tarifs/quotas et lecture seule à échéance ; pas de nouveaux paywalls implicites |
| Personnalisation des menus | Présent mais partiel | `MenuSettings`, `AdminLayout`, `menu_config` : visibilité de sections, sans contrôle API | Réutiliser présentation ; séparer préférence d'affichage et sécurité |
| Modules de cours e-learning | Fonctionnel partiellement testé en CI existante | `academic/elearning.py` : cours, modules pédagogiques, leçons, progression | Ne pas confondre module de cours et module fonctionnel SaaS |
| Gouvernance SaaS pédagogique | Défectueux/partiel au sens d'application des règles | `SaaSSettings` enregistre des flags JSON ; classe `SchoolSetting` isolée non enregistrée/migrée dans le code inspecté ; `compensation_enabled`/`grading_scale_max` non consommés par `academic_rules.py` | Ne pas créer une seconde autorité de calcul ; annoncer ce qui est appliqué |
| Cycle et accès par cycle | Absent | Pas de cycle_id sur niveaux/classes, ni de périmètre cycle dans UserRole | Modèle additif ; comptes et finances communs au tenant |
| Hors ligne | Fonctionnel en CI sur scénarios de présences, terrain non vérifié | Parcours 10/11 et purge existants ; appareils réels non exécutés | Ne pas conserver une autorisation périmée comme décision de sécurité serveur |

« Fonctionnel et testé » signifie uniquement les scénarios cités, pas une
certification de l'ensemble du module. L'audit exhaustif des actions de toutes les
pages et le terrain Android restent NON VÉRIFIÉS dans ce lot.

## Risques à traiter dans l'architecture

1. Une préférence de menu ne doit pas être utilisée comme autorisation.
2. Un X-Cycle-ID fourni par le navigateur ne prouve pas le cycle d'une ressource.
   Les liens niveau/classe/inscription/évaluation doivent déterminer le périmètre.
3. Les données anciennes sans cycle ne doivent pas être réaffectées ou masquées
   silencieusement lors de la migration.
4. Les writers de `tenants.settings` sont nombreux : un moteur critique ne doit
   pas pouvoir être remplacé par un PATCH JSON générique ou un cache offline.
5. L'activation d'un module absent ou de dépendances invalides doit être refusée.
6. Une désactivation ou baisse d'abonnement ne doit effectuer aucun DELETE des
   inscriptions, notes, crédits, paiements ou liens familiaux.
