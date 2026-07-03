# Commercialisation — Marché Guinéen

## Positionnement

**SchoolFlow Pro** (nom commercial suggéré : *EduGuinée Pro*) est une plateforme
SaaS multi-tenant de gestion scolaire pour les établissements guinéens :

> « Plateforme de gestion scolaire moderne pour les établissements guinéens —
> écoles, collèges, lycées, universités et centres de formation.
> Gestion des élèves, notes, présences, frais scolaires et communication parents. »

## Cibles

| Segment | Besoin principal | Plan recommandé |
|---|---|---|
| Écoles privées primaires | Frais scolaires + communication parents | Starter / Pro |
| Collèges & lycées privés | Notes, bulletins PDF, présences | Pro |
| Universités & instituts | Multi-départements, LMD, emploi du temps | Enterprise |
| Centres de formation | Inscriptions, paiements par session | Starter |
| Partenaires institutionnels (ministère) | Reporting consolidé | Enterprise (module Bêta) |

## Adaptations guinéennes intégrées

- **Pays / devise / fuseau** : défauts `GN` / `GNF` / `Africa/Conakry` (modèle Tenant)
- **Année scolaire** : 1er septembre → 31 juillet
- **Niveaux préconfigurés** (modifiables dans les réglages) :
  - Primaire : CP1, CP2, CE1, CE2, CM1, CM2
  - Collège : 7ème, 8ème, 9ème, 10ème
  - Lycée : 11ème, 12ème, Terminale
  - Université : Licence 1 → Master 2
- **Types de frais suggérés** : inscription, réinscription, mensualité, transport,
  cantine, tenue scolaire, fournitures, examen
- **Types d'établissement** : école primaire, collège, lycée, université/grandes
  écoles, centre de formation

## Parcours commercial (self-service)

1. Le prospect visite la page d'accueil publique (`/`)
2. CTA **« Créer mon établissement »** → `/inscription`
3. `POST /api/v1/auth/register-school/` crée : tenant + compte TENANT_ADMIN
   + **essai Pro 30 jours** + JWT (connexion immédiate) + email de bienvenue
4. Redirection vers `/{slug}/admin/onboarding` : infos établissement, logo,
   année scolaire, niveaux (templates guinéens), classes, matières, frais
5. Dashboard admin opérationnel

## Tarification

| Plan | Cible | Contenu |
|---|---|---|
| **Starter** | Petites écoles | Élèves limités, fonctionnalités de base |
| **Pro** | École complète | Bulletins, finances, portail parents, notifications |
| **Enterprise** | Multi-campus / université | Reporting, support prioritaire, personnalisation |

### Paiement hors ligne (majoritaire en Guinée)

Les écoles paient par virement, espèces ou mobile money (Orange Money, Wave).
Le flux :

1. L'école choisit un plan et paie hors ligne
2. Le super-admin active l'abonnement :
   `PATCH /api/v1/platform/tenants/{tenant_id}/subscription/`
   ```json
   { "plan": "pro", "status": "active", "expires_at": "2027-07-31T00:00:00" }
   ```
3. L'action est auditée (audit log) ; Stripe reste disponible en option

## Modules « stable commercial » (MVP vendable)

Tenant/établissement, utilisateurs & rôles, élèves, parents, enseignants,
classes/niveaux/matières, admissions, présences, notes, bulletins PDF,
frais & paiements, reçus PDF, dashboard direction, notifications email,
import CSV élèves, landing page publique par établissement, audit logs,
paramètres tenant.

## Modules « Bêta » (visibles, non bloquants)

IA/insights, marketplace, e-learning, gamification, alumni, clubs, carrières,
reporting ministère, signature électronique, visioconférence.
Chacun porte un badge **Bêta** dans le menu admin — aucune route supprimée.

## Argumentaire de vente (pitch 2 minutes)

1. **Problème** : gestion papier → pertes de frais non recouvrés, bulletins lents,
   parents sans visibilité.
2. **Solution** : plateforme unique en français, pensée pour le système guinéen
   (niveaux, GNF, année scolaire locale), accessible sur mobile.
3. **Preuve** : démo en direct — création d'un établissement en 10 minutes,
   inscription d'un élève, facture + reçu PDF en GNF.
4. **Offre** : 30 jours d'essai Pro gratuits, sans carte bancaire ;
   paiement en GNF par mobile money ou virement.
