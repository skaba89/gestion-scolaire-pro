# Site public et sites vitrines — audit, architecture et maturité

> État établi le **2026-11-25** à partir du code de `main` (après #600) et de vérifications en
> lecture seule sur la production. Le code fait foi : mettre ce document à jour à chaque lot.
> Architecture détaillée des modèles premium : [`src/public-site/README.md`](../../src/public-site/README.md).

## 1. Architecture actuelle (trois couches, toutes en service)

| Couche | Où | Rôle |
|---|---|---|
| Accueil « historique » | `src/pages/public/TenantLanding.tsx` + `src/pages/public/landing/*` (4 modèles) | Page d'accueil d'un établissement selon son type (`src/lib/tenantTemplateGroup.ts`). |
| Pages libres (CMS) | `PublicPage` (backend `core/public_pages.py`), `src/pages/admin/PublicPagesManager.tsx`, `SectionsBuilder.tsx`, `PublicPageView.tsx` | Pages composées de sections JSON, publiées ou non, ordonnées ; formulaires de contact. |
| Modèles premium | `src/public-site/` (registre, 15 sections partagées, jetons de thème) | 3 modèles (School Excellence, Campus Prestige, Primary Bloom) choisis par `settings.landing.site_template_id`, rendus avant l'accueil historique. |

Données publiques : `GET /tenants/public/` (annuaire), `GET /tenants/public/{slug}/` et
`/tenants/slug/{slug}/` (profil), `/tenants/public/{slug}/pages|nav/`, `POST
/tenants/public/{slug}/submit-form/`, `/admissions/public/*`. Réglages du site : `settings.landing`
(`TenantLandingSettings`, `backend/app/schemas/tenants.py`), édités dans `LandingPageEditor.tsx`.

## 2. Inventaire des pages publiques

| Page | Route | Statut | Remarques |
|---|---|---|---|
| Accueil plateforme | `/` | Fonctionnelle | `SchoolFlowHomePage`. |
| Annuaire des établissements | `/annuaire` | Fonctionnelle | Données réelles uniquement ; filtres région et préfecture côté serveur (`GET /tenants/public/?q&type&region&prefecture&city`, listes via `GET /tenants/public/facets/`) ; recherche par nom et type ; pas encore de filtre par cycle, statut public/privé ni diplôme. |
| Formations et implantations | `/ecole/:slug/offre` | Fonctionnelle | Cycles et niveaux, filières, facultés et départements, campus si l'établissement les publie (`show_campuses`, désactivé par défaut). Aucun responsable publié. Accessible depuis l'annuaire et le menu des 7 modèles d'accueil. |
| Site d'un établissement | `/ecole/:slug`, `/:slug` | Fonctionnelle en dev | Cassée en production jusqu'au déploiement de #600 (PUBLIC-DOMAIN-01). |
| Pages libres | via `PublicPageView` | Fonctionnelle | Publié / non publié ; pas de brouillon versionné ni de relecture. |
| Admissions, statut, réinscription | `/admissions/:slug`, `/info/:slug`, `/inscription/:slug…` | Fonctionnelles | Réutilisent le module d'admissions. Traduites en 5 langues avec sélecteur de langue (2026-11-25, sous-lot T1). |
| Programmes, calendrier, contact | `/programmes|calendrier|contact/:slug` | Fonctionnelles | Programmes = niveaux. |
| Confidentialité, conditions | `/privacy`, `/terms` | Fonctionnelles | Textes non traduits. |
| Tarifs, inscription d'une école | `/tarifs`, `/inscription` | Fonctionnelles | |
| Annuaire national des formations (tous établissements) | — | **Absent** | Catalogue public transversal à créer (tables isolées par établissement : migration). |
| Annuaire des enseignants | — | **Absent** | Profils publics à consentement explicite à concevoir. |
| Actualités, événements (contenus éditoriaux) | — | **Absents** | Seules des « annonces » existent dans `settings.landing`. |
| Sitemap XML, canoniques, données structurées, hreflang | — | **Absents** | `public/robots.txt` existe. |

## 3. Matrice des modules publics par type d'établissement (état réel)

| Type | Ce qui existe | Manque |
|---|---|---|
| Maternelle / primaire | Modèle Primary Bloom, accueil « primaire », admissions | Pédagogie, activités, vie scolaire dédiées |
| Collège / lycée | Accueil « lycée », School Excellence, programmes (niveaux) | Séries, spécialités, orientation |
| Université / supérieur | Accueil « université », Campus Prestige, départements publiés avec leurs matières | Facultés, licences/masters/doctorats, recherche |
| Centre / formation professionnelle | Accueil par défaut | Sessions, certifications, tarifs |
| Multi-cycles | — | Navigation par cycle |

## 4. Sécurité et confidentialité (constats et corrections)

| Identifiant | Constat | État |
|---|---|---|
| PUBLIC-DOMAIN-01 (P1) | Tout hôte inconnu pris pour un domaine d'école : `/ecole/<slug>` introuvable en production. | Corrigé (#600), non déployé. |
| CUSTOM-DOMAIN-CLAIM-01 (P2) | Domaine personnalisé lu dans un champ libre, ni vérifié ni unique : une école pouvait revendiquer le domaine d'une autre. | Corrigé (option B) : résolution par domaine désactivée (404) jusqu'au lot « domaines personnalisés ». |
| PUBLIC-STATS-01 (P3) | Nombres d'élèves et d'enseignants publiés par l'API même quand l'école les masque. | Corrigé : 0 quand `show_stats` est faux. |
| — | Trois erreurs du profil public ignorées sans trace. | Corrigé : journalisées (identifiant d'établissement seulement). |
| — | `page_size` de l'annuaire sans plafond. | Corrigé : 200 au plus. |
| Acquis | Formulaires publics : pot de miel, limite de débit par IP et établissement, RGPD ; e-mail/téléphone du compte administrateur jamais publiés ; liens sociaux filtrés contre `javascript:`. | Tests existants. |

**Domaines personnalisés — à faire (lot dédié).** `tenant_domains` (unicité, jeton DNS,
vérification par la plateforme) est sous RLS forcée : la résolution publique demande une fonction
SQL `SECURITY DEFINER` (même méthode que `resolve_payment_tenant`, migration 20261007_0001), puis des
certificats TLS côté proxy et une vérification DNS automatisée.

## 5. Maturité (mesurée sur preuves, non certifiée)

| Domaine | Poids | Observé | Justification |
|---|---:|---:|---|
| Pages publiques et design premium | 15 | 8 | 3 modèles premium + 4 historiques, sections partagées ; textes non traduits ; site d'établissement cassé en production avant déploiement de #600. |
| Modularité multi-établissements | 15 | 6 | Modèle par type d'établissement ; pas de modules publics par cycle ni par abonnement. |
| Annuaires et recherche | 10 | 5 | Annuaire des établissements filtré côté serveur (région, préfecture, ville, type, nom) ; offre et implantations par établissement ; pas d'annuaire national des formations ni des enseignants. |
| CMS et constructeur de pages | 15 | 6 | Pages libres, sections, ordre, publication ; ni brouillon versionné, ni relecture, ni historique. |
| Admissions et parcours visiteurs | 10 | 7 | Candidature, statut, réinscription, contact, protections anti-spam. |
| Sécurité et isolation multi-tenant | 15 | 11 | Isolation testée sous rôle restreint ; domaines personnalisés à construire. |
| SEO, accessibilité et performance | 10 | 2 | `robots.txt`, métadonnées partielles ; pas de sitemap ni de mesure Lighthouse. |
| Tests, qualité et déploiement | 10 | 6 | Tests unitaires et PostgreSQL des routes publiques ; aucun parcours E2E du site public. |
| **Total** | **100** | **≈ 51** | Objectif 99/100 non atteint. |

## 6. Feuille de route proposée (chaque lot : plan validé, PR, CI verte)

1. Domaines personnalisés : fonction de résolution, vérification DNS, TLS.
2. Annuaires, suite : catalogue national des formations, annuaire des enseignants (consentement), filtres par cycle et statut.
3. CMS éditorial : brouillon, prévisualisation privée, publication, historique.
4. SEO : sitemap par établissement, canoniques, Open Graph, données structurées.
5. Traduction des pages publiques (fr, en, es, ar, zh).
6. Parcours E2E du site public et mesures Lighthouse.

## 7. Traduction des pages publiques

- **T1 (parcours candidat, 2026-11-25)** : informations d'admission, formulaire de candidature,
  portail d'inscription, statut du dossier, réinscription, contact et formulaire de contact des
  modèles premium — espace de noms `publicJourney`, 5 langues, sélecteur de langue sur chaque page.
- À faire : T2 (annuaire, connexion, inscription d'une école), T3 (modèles d'accueil et sections
  premium), T4 (pages légales : texte français faisant foi, avertissement traduit — Q-T1).
- **Relecture** : les traductions anglaise, espagnole, arabe et chinoise ont été rédigées sans
  relecture par un locuteur natif ; à faire relire avant un lancement national ou international.
- **Contenus génériques à vérifier** (repérés pendant T1, non modifiés) : la page d'informations
  d'admission affiche des délais (5 à 10 jours), des pièces et des modes de paiement (virement,
  espèces, chèque) identiques pour tous les établissements ; la page `/contact/:slug` affiche des
  horaires fixes (8 h – 17 h) et **n'envoie pas** le message (envoi simulé, CONTACT-FAKE-SEND-01).

