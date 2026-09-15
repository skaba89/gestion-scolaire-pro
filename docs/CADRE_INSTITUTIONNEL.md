# Cadre de qualification institutionnelle — Academy Guinéenne

Ce document définit ce qu'exige un déploiement **institutionnel**
(ministère, plusieurs dizaines/centaines d'établissements, engagement
public) au-delà d'un pilote payant à un seul établissement — et distingue
explicitement ce qui est déjà en place de ce qui reste à faire, avec qui en
a la responsabilité.

Le terme « institutionnel » ne vaut pas autorisation de déploiement
national. Un passage à l'échelle d'un pays exige un Go/No-Go documenté
couvrant la sécurité, l'hébergement des données, la continuité d'activité
et la validation opérationnelle — voir §4.

## 1. Trois réalités à ne jamais confondre

| Réalité | État actuel |
|---|---|
| **Le pilote payant** (1 établissement réel, ex. Université La Source) | En production sur Render (plan gratuit), healthchecks sains, CI verte. Voir `docs/reports/FINAL_PRODUCTION_READINESS_AUDIT.md`. |
| **Le socle institutionnel** (RBAC `MINISTRY_ADMIN`/`REGIONAL_DIRECTOR`, RGPD, audit, MFA) | Codé et testé — voir `docs/INSTITUTIONAL_ROLES.md`, `docs/SECURITY_MODEL.md`. Jamais éprouvé à l'échelle d'un déploiement multi-établissements réel. |
| **Le jeu de démonstration local** (Docker Compose, comptes `*.local`) | Synthétique, interdit en production — les identifiants et secrets de `.env.docker.example` ne doivent jamais atteindre un environnement réel. |

## 2. Séparation des environnements

**Cible** (à mettre en place avant tout engagement ministériel) :

| Environnement | Rôle | État actuel |
|---|---|---|
| **DEV** | Développement local, données synthétiques | ✅ Docker Compose local |
| **REC** (recette) | Validation fonctionnelle avant mise en prod, données synthétiques réalistes | ❌ N'existe pas — à provisionner |
| **PPD** (pré-production) | Répétition générale à l'échelle réelle attendue (charge, données volumétriques) | ❌ N'existe pas — à provisionner |
| **PROD** | Le pilote payant actuel | 🟡 Un seul environnement Render (plan gratuit), pas encore dimensionné pour un usage institutionnel |

Sans **REC**, aucune migration de schéma ni changement de configuration
sensible ne peut être répété avant de toucher à la production réelle.
Sans **PPD**, aucun test de charge représentatif n'est possible (voir
`docs/NATIONAL_SCALE_READINESS.md`, palier 100 tenants jugé « non
représentatif »).

## 3. Hébergement et souveraineté des données

Le pilote actuel utilise Neon (PostgreSQL serverless) et Render, tous deux
hébergés hors du continent africain. Acceptable pour un pilote ; à
requalifier avant un engagement ministériel — plusieurs administrations
exigeront un hébergement local, régional (Afrique de l'Ouest), ou une
clause contractuelle de résidence des données. **Décision qui appartient à
l'opérateur et, le cas échéant, au partenaire institutionnel** — hors de la
portée d'une session de développement.

## 4. Grille Go/No-Go par échelle

Une checklist réutilisable, pas un jugement figé — à revalider avant
chaque changement d'échelle (nouveau pilote, extension régionale,
déploiement national).

### 4.1 Sécurité

- [ ] Rôle PostgreSQL de production vérifié non-superutilisateur / non-`BYPASSRLS`
      (voir `docs/SECURITY_MODEL.md §3` — vérification automatisée au
      démarrage et via `GET /platform/security/database-role/` depuis
      2026-09 ; **reste à lancer contre l'environnement réel** par un
      opérateur ayant cet accès).
- [ ] MFA obligatoire pour tous les rôles à privilège (`TENANT_ADMIN`,
      `DIRECTOR`, `MINISTRY_ADMIN`, `SUPER_ADMIN`) — vérifier la
      configuration `mfa_required` sur le déploiement cible, pas seulement
      la capacité du code.
- [ ] Scan de sécurité CI (`Security Scan`) vert sur la branche déployée.
- [ ] Aucun secret par défaut (`CHANGE_ME_*`) en configuration réelle.

### 4.2 Continuité d'activité

- [ ] RPO/RTO de `docs/DRP_GUIDE.md` testés sur l'environnement cible (pas
      seulement en CI sur SQLite/Linux générique).
- [ ] SLA de `docs/SLA.md` compatible avec l'offre proposée à
      l'établissement/au ministère.

### 4.3 Charge et scalabilité

- [ ] Palier de charge testé représentatif du nombre d'établissements visé
      (voir `docs/NATIONAL_SCALE_READINESS.md` — 10 tenants validé, 100
      non représentatif, 1000+ jamais exécuté).
- [ ] Monitoring ventilé par tenant en place si l'infrastructure est
      mutualisée entre plusieurs établissements sensibles (actuellement un
      agrégat plateforme uniquement).

### 4.4 Business / opérationnel

- [ ] Canal de notification proactive (WhatsApp) opérationnel si promis à
      l'établissement — templates Meta soumis et approuvés
      (`docs/WHATSAPP_NOTIFICATIONS.md`).
- [ ] Support et astreinte définis pour le niveau de service vendu
      (`docs/SUPPORT_RUNBOOK.md`, `docs/PRODUCTION_RUNBOOK.md`).

**Aucune case cochée par une session de développement automatisée** —
chaque ligne exige soit un accès (infra, comptes tiers) que cette session
n'a pas, soit une décision (résidence des données, niveau de SLA vendu) qui
appartient à l'opérateur ou au partenaire institutionnel.

## 5. Registre de décisions

Les arbitrages qui engagent un changement d'échelle ou de posture (ex. :
« on ouvre un deuxième établissement », « on active REC ») doivent être
tracés, pas seulement discutés en session. Voir
[`docs/REGISTRE_DECISIONS_INSTITUTIONNELLES.md`](./REGISTRE_DECISIONS_INSTITUTIONNELLES.md)
et le modèle [`docs/templates/DECISION_INSTITUTIONNELLE.md`](./templates/DECISION_INSTITUTIONNELLE.md).

## 6. Rôles et responsabilités

| Décision | Qui tranche |
|---|---|
| Passage REC → PPD → PROD d'un changement | Responsable technique du projet |
| Résidence des données, hébergement | Opérateur + partenaire institutionnel (contractuel) |
| Niveau de SLA vendu à un établissement/ministère | Direction commerciale/opérateur |
| Go/No-Go déploiement national | Opérateur, avec un dossier de preuves (§4) à l'appui — jamais une seule personne sur la base d'une impression |

## Documents liés

- `docs/SECURITY_MODEL.md` — modèle de sécurité vérifié par le code
- `docs/NATIONAL_SCALE_READINESS.md` — état réel de la scalabilité
- `docs/SLA.md`, `docs/DRP_GUIDE.md` — engagements et continuité
- `docs/INSTITUTIONAL_ROLES.md` — RBAC institutionnel implémenté
- `docs/STATUT_ACTUEL.md` — source de vérité datée sur l'état des fonctionnalités
