# État de préparation — Dashboard Ministère / Supervision (Phase 5 commercialisation)

Positionnement national — s'appuie directement sur le travail déjà posé
lors d'un audit institutionnel antérieur (voir `docs/INSTITUTIONAL_ROLES.md`).

## Modèle institutionnel actuel

| Élément | État |
|---|---|
| `Tenant.region` / `.prefecture` / `.commune` | ✅ colonnes posées, indexées (migration `20260727_0001`) — libres (pas d'enum/FK), même principe que `region` |
| Ces 3 champs sont **settables** via `PATCH /tenants/{id}/` | ✅ ajouté en même temps — `region` existait depuis la Phase 2 mais n'était jamais settable nulle part dans l'API (bug trouvé en câblant cette phase) |
| Rôle `MINISTRY_ADMIN` | ✅ posé — platform-level (`tenant_id` NULL), permission `ministry:read` unique, agrégats nationaux uniquement, jamais de détail par établissement (vérifié par tests : le nom d'un établissement testé n'apparaît jamais dans la réponse) |
| Rôle `REGIONAL_DIRECTOR` | ✅ posé — NON platform-level (garde son `tenant_id`), voit uniquement sa propre région (vérifié par tests) |
| `PREFECTURE_ADMIN` | ✅ posé — même patron que `REGIONAL_DIRECTOR`, narrowed à `Tenant.prefecture` (vérifié par tests) |
| `COMMUNE_ADMIN` | ✅ posé — même patron, narrowed à `Tenant.commune` (vérifié par tests) |
| Règle "champ non renseigné = zéro établissement visible" | ✅ vérifiée par test dédié — un `PREFECTURE_ADMIN` dont le tenant n'a pas de préfecture renseignée voit `total_establishments: 0`, jamais la vue nationale (un vrai bug de cette forme a été trouvé et corrigé pendant l'implémentation : `Tenant.prefecture == None` matchait TOUS les tenants sans préfecture au lieu de n'en retourner aucun) |
| `NATIONAL_INSPECTOR` | ❌ non posé — délibérément, périmètre pas défini avec un vrai interlocuteur ministériel (voir roadmap) |
| `UNIVERSITY_RECTOR` | ❌ non posé — délibérément, même raison |

## Indicateurs disponibles

| Indicateur | Disponible | Source |
|---|---|---|
| Nombre d'établissements | ✅ | `GET /ministry/overview/` |
| Établissements actifs/inactifs | ✅ | `GET /ministry/overview/` |
| Répartition par région | ✅ | `GET /ministry/overview/` (`by_region`), narrowed automatiquement pour `REGIONAL_DIRECTOR`/`PREFECTURE_ADMIN`/`COMMUNE_ADMIN` |
| Répartition par préfecture | ✅ | `GET /ministry/overview/` (`by_prefecture`) |
| Répartition par commune | ✅ | `GET /ministry/overview/` (`by_commune`) |
| Répartition par type d'établissement | ✅ | `GET /ministry/overview/` (`by_type`) |
| Export CSV agrégat national | ✅ | `GET /ministry/overview/export/` — inclut désormais les lignes `prefecture`/`commune` |
| KPIs ministère détaillés | ✅ | `GET /analytics/ministry-kpis/` |
| Statistiques par niveau | ✅ | `GET /analytics/ministry-stats/levels/` |
| Export CSV ministère (analytics) | ✅ | `GET /analytics/ministry-export/csv/` |
| Élèves par préfecture/commune (élève, pas juste comptage d'établissements) | ❌ | `by_prefecture`/`by_commune` comptent des établissements, pas des élèves — pas construit |
| Enseignants par région | ⚠️ à vérifier | pas confirmé dans cette passe si `ministry-kpis` le couvre déjà |
| Taux de présence/réussite agrégé national | ⚠️ à vérifier | probablement dans `ministry-kpis`, non audité ligne à ligne dans cette passe |
| Répartition public/privé | ❌ | aucune colonne `is_public`/`ownership_type` trouvée sur `Tenant` |
| Paiements agrégés (établissements privés) | ❌ | non construit — cohérent avec la prudence attendue (données financières inter-établissements sensibles) |

## Règles de cloisonnement — vérifiées

- ✅ Le ministère (`MINISTRY_ADMIN`) voit les agrégats nationaux, jamais le détail d'un établissement — testé explicitement (le nom d'un établissement créé pour le test n'apparaît jamais dans la réponse).
- ✅ Une région (`REGIONAL_DIRECTOR`) ne voit que sa région — testé explicitement avec deux régions distinctes.
- ✅ Une préfecture (`PREFECTURE_ADMIN`) ne voit que sa préfecture — testé explicitement.
- ✅ Une commune (`COMMUNE_ADMIN`) ne voit que sa commune — testé explicitement.
- ✅ Un rôle plateforme (`SUPER_ADMIN`) mélangé avec n'importe quel rôle scopé garde toujours la vue complète — le niveau plateforme l'emporte toujours (règle explicite, testée pour les 3 rôles).
- ✅ Un rôle scopé dont le tenant n'a pas le champ correspondant renseigné voit zéro établissement, jamais la vue nationale — testé explicitement (voir bug trouvé/corrigé ci-dessus).
- ✅ Un établissement ne voit que ses propres données — c'est la règle de base de tout le projet (RLS + filtrage `tenant_id` systématique), pas spécifique au module ministère.

## Risques

- **Fuite de données personnelles** : aucune trouvée dans le module ministère actuel — `_build_public_response`/`_compute_overview` n'exposent que des compteurs, jamais de champ nominatif (vérifié par test dédié `test_overview_never_leaks_individual_tenant_fields`).
- **Pas de rôle UNIVERSITY_RECTOR** : le mode université existe déjà au niveau pédagogique (ECTS, relevé de notes — voir travaux antérieurs), mais aucun rôle de supervision multi-établissements universitaires n'existe encore.

## Endpoints (référence)

```
GET /ministry/overview/              agrégat national/régional (narrowed automatiquement selon le rôle)
GET /ministry/overview/export/       export CSV du même agrégat
GET /analytics/ministry-kpis/        KPIs ministère détaillés
GET /analytics/ministry-stats/levels/  statistiques par niveau scolaire
GET /analytics/ministry-export/csv/  export CSV analytics ministère
```

## Statut : préfecture/commune livrées (Phase 5)

Les étapes "Semaines 1-8" de la roadmap ci-dessous ont été réalisées :
colonnes `prefecture`/`commune` posées et settables, rôles
`PREFECTURE_ADMIN`/`COMMUNE_ADMIN` posés avec le même patron de narrowing
que `REGIONAL_DIRECTOR`, tests d'isolation stricts (y compris le cas
"champ non renseigné"). Front-end pas encore mis à jour pour afficher un
sélecteur préfecture/commune côté onboarding/paramètres — reste une
étape UI, pas un manque de capacité backend.

## Restant (délibérément hors périmètre)

`NATIONAL_INSPECTOR` et `UNIVERSITY_RECTOR` ne sont pas posés — leur
périmètre exact (accès en lecture élargi pour l'un, supervision
multi-établissements universitaires pour l'autre) doit être défini avec
un vrai interlocuteur ministériel/universitaire avant de construire quoi
que ce soit, pas deviné à l'avance (règle explicite contre la
construction de fonctionnalités pour un besoin hypothétique).

Ne jamais exposer de donnée individuelle (élève, enseignant, paiement) à
un rôle institutionnel sans permission explicite et testée — même
standard que `MINISTRY_ADMIN`/`REGIONAL_DIRECTOR`/`PREFECTURE_ADMIN`/
`COMMUNE_ADMIN` aujourd'hui.
