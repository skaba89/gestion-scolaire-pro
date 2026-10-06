---
name: ui-ux-guide
description: Règles UI/UX d'Academy Guinéenne — shadcn/Radix + Tailwind, accessibilité, RTL arabe, mobile et faible bande passante, terminologie scolaire/universitaire, états de chargement/vide/erreur. À utiliser pour concevoir ou relire une interface.
---

# UI / UX

## Contexte utilisateurs

- Directions d'établissement, secrétariat, comptables, enseignants, parents,
  élèves, tutelle ministérielle. Beaucoup d'usage **mobile**, réseau **lent ou
  intermittent** (Guinée), appareils d'entrée de gamme.
- Langue par défaut : français. Arabe en **RTL**. Libellés adaptés au type
  d'établissement (`useTerminology` : élève/étudiant/apprenant, classe/promotion…).

## Composants

- Primitives `src/components/ui/` (shadcn/Radix) + icônes `lucide-react`.
  Ne pas introduire une autre bibliothèque de composants.
- Couleurs/espacements via les tokens Tailwind (`tailwind.config.ts`) et le
  branding tenant (`TenantBranding`) — pas de couleur en dur.
- Thème clair/sombre : vérifier les deux.

## Checklist écran

- [ ] États : chargement (skeleton), vide (message + action), erreur (message actionnable, réessayer)
- [ ] Responsive : 360 px de large sans scroll horizontal ; tableaux → cartes ou scroll contenu
- [ ] Accessibilité : labels de formulaire, focus visible, navigation clavier, contrastes AA, `aria-*` des dialogues Radix conservés
- [ ] RTL : pas de `left/right` en dur quand `start/end` convient ; icônes directionnelles inversées
- [ ] i18n : aucun texte en dur, textes plus longs (ar/es) ne cassent pas la mise en page
- [ ] Actions destructives : confirmation (`AlertDialog`) avec conséquence explicite
- [ ] Formulaires : validation zod + react-hook-form, erreurs par champ, bouton désactivé pendant l'envoi
- [ ] Faible réseau : pas de gros médias inutiles, pagination, retours visuels pendant les retries
- [ ] Actions masquées selon `usePermissions` (sans s'y fier pour la sécurité)

## Relecture

Classer les constats : `Bloquant` (inutilisable / inaccessible), `Majeur`, `Mineur`,
`Suggestion`. Toujours citer `fichier:ligne`.
