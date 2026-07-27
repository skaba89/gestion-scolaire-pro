# État de préparation — Dashboard Ministère / Supervision (Phase 5 commercialisation)

Positionnement national — s'appuie directement sur le travail déjà posé
lors d'un audit institutionnel antérieur (voir `docs/INSTITUTIONAL_ROLES.md`).

## Modèle institutionnel actuel

| Élément | État |
|---|---|
| `Tenant.region` | ✅ colonne posée, indexée |
| Préfecture / commune | ❌ pas de colonnes dédiées — seul `region` existe sur `Tenant` |
| Rôle `MINISTRY_ADMIN` | ✅ posé — platform-level (`tenant_id` NULL), permission `ministry:read` unique, agrégats nationaux uniquement, jamais de détail par établissement (vérifié par tests : le nom d'un établissement testé n'apparaît jamais dans la réponse) |
| Rôle `REGIONAL_DIRECTOR` | ✅ posé — NON platform-level (garde son `tenant_id`), voit uniquement sa propre région (vérifié par tests : deux régions créées, un `REGIONAL_DIRECTOR` de la région A ne voit jamais les établissements de la région B) |
| `NATIONAL_INSPECTOR` | ❌ non posé |
| `PREFECTURE_ADMIN` | ❌ non posé (dépend de la colonne préfecture, absente) |
| `COMMUNE_ADMIN` | ❌ non posé (dépend de la colonne commune, absente) |
| `UNIVERSITY_RECTOR` | ❌ non posé |

## Indicateurs disponibles

| Indicateur | Disponible | Source |
|---|---|---|
| Nombre d'établissements | ✅ | `GET /ministry/overview/` |
| Établissements actifs/inactifs | ✅ | `GET /ministry/overview/` |
| Répartition par région | ✅ | `GET /ministry/overview/` (`by_region`), narrowed automatiquement pour `REGIONAL_DIRECTOR` |
| Répartition par type d'établissement | ✅ | `GET /ministry/overview/` (`by_type`) |
| Export CSV agrégat national | ✅ | `GET /ministry/overview/export/` |
| KPIs ministère détaillés | ✅ | `GET /analytics/ministry-kpis/` |
| Statistiques par niveau | ✅ | `GET /analytics/ministry-stats/levels/` |
| Export CSV ministère (analytics) | ✅ | `GET /analytics/ministry-export/csv/` |
| Élèves par préfecture/commune | ❌ | dépend des colonnes préfecture/commune, absentes |
| Enseignants par région | ⚠️ à vérifier | pas confirmé dans cette passe si `ministry-kpis` le couvre déjà |
| Taux de présence/réussite agrégé national | ⚠️ à vérifier | probablement dans `ministry-kpis`, non audité ligne à ligne dans cette passe |
| Répartition public/privé | ❌ | aucune colonne `is_public`/`ownership_type` trouvée sur `Tenant` |
| Paiements agrégés (établissements privés) | ❌ | non construit — cohérent avec la prudence attendue (données financières inter-établissements sensibles) |

## Règles de cloisonnement — vérifiées

- ✅ Le ministère (`MINISTRY_ADMIN`) voit les agrégats nationaux, jamais le détail d'un établissement — testé explicitement (le nom d'un établissement créé pour le test n'apparaît jamais dans la réponse).
- ✅ Une région (`REGIONAL_DIRECTOR`) ne voit que sa région — testé explicitement avec deux régions distinctes.
- ✅ Un rôle plateforme (`SUPER_ADMIN`) mélangé avec `REGIONAL_DIRECTOR` garde toujours la vue complète — le niveau plateforme l'emporte toujours (règle explicite, testée).
- ❌ Préfecture/commune : règle non vérifiable, la donnée elle-même n'existe pas encore.
- ✅ Un établissement ne voit que ses propres données — c'est la règle de base de tout le projet (RLS + filtrage `tenant_id` systématique), pas spécifique au module ministère.

## Risques

- **Fuite de données personnelles** : aucune trouvée dans le module ministère actuel — `_build_public_response`/`_compute_overview` n'exposent que des compteurs, jamais de champ nominatif (vérifié par test dédié `test_overview_never_leaks_individual_tenant_fields`).
- **Absence de préfecture/commune** : bloque toute promesse commerciale précise "un rôle préfectoral" avant d'ajouter le modèle de données correspondant — ne pas vendre cette capacité tant qu'elle n'existe pas.
- **Pas de rôle UNIVERSITY_RECTOR** : le mode université existe déjà au niveau pédagogique (ECTS, relevé de notes — voir travaux antérieurs), mais aucun rôle de supervision multi-établissements universitaires n'existe encore.

## Endpoints (référence)

```
GET /ministry/overview/              agrégat national/régional (narrowed automatiquement selon le rôle)
GET /ministry/overview/export/       export CSV du même agrégat
GET /analytics/ministry-kpis/        KPIs ministère détaillés
GET /analytics/ministry-stats/levels/  statistiques par niveau scolaire
GET /analytics/ministry-export/csv/  export CSV analytics ministère
```

## Roadmap 90 jours (national scale)

**Ne pas construire avant que paiements et imports soient stables sur le
pilote fermé** (règle explicite de cette phase) — cette roadmap suppose
que les Phases 1-2 de cette même série sont déjà validées en conditions
réelles avec un client pilote.

1. **Semaines 1-4** : ajouter les colonnes préfecture/commune sur `Tenant` (migration additive, non destructive), peupler pour les tenants pilotes.
2. **Semaines 4-8** : poser `PREFECTURE_ADMIN`/`COMMUNE_ADMIN` en suivant exactement le patron déjà éprouvé de `REGIONAL_DIRECTOR` (narrowing automatique, tests d'isolation stricts).
3. **Semaines 8-12** : `NATIONAL_INSPECTOR` (probablement un accès en lecture élargi, à définir précisément avec un vrai interlocuteur ministériel avant de construire) et `UNIVERSITY_RECTOR`.
4. **En continu** : ne jamais exposer de donnée individuelle (élève, enseignant, paiement) à un rôle institutionnel sans permission explicite et testée — même standard que `MINISTRY_ADMIN`/`REGIONAL_DIRECTOR` aujourd'hui.

Cette roadmap est délibérément repoussée après la validation commerciale
du pilote fermé, conformément à la règle "ne pas créer un énorme module
ministère si les paiements/imports ne sont pas stables".
