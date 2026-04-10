# Phase 6 — Nettoyage des reliquats legacy et réduction du bruit runtime

## Objectif
Réduire les reliquats techniques hérités qui polluent encore le projet alors que la trajectoire cible est désormais :
- frontend React/Vite
- OIDC / Keycloak
- backend FastAPI
- store Zustand
- API souveraine

## Lot traité
### 1. Shim Supabase
Le fichier `src/integrations/supabase/client.ts` reste présent comme mécanisme de transition.

Problèmes identifiés avant correction :
- logs bruyants au chargement ;
- warnings répétés à chaque accès ;
- comportement acceptable pour le build, mais trop bavard pour une base de pré-production.

### 2. Réduction du bruit console
Le shim est ramené à une logique de journalisation bornée par environnement / flag dédié.

### 3. Test ciblé
Ajout d’un test pour garantir :
- que le shim reste chainable ;
- qu’il n’explose pas au runtime ;
- que les warnings sont bornés.

## Intention architecture
Cette phase ne remet pas encore à plat tout le reliquat Supabase. Elle sécurise la transition en évitant que le shim devienne lui-même une source d’instabilité ou de bruit inutile.

## Étape suivante recommandée
Après merge :
1. inventorier les appels réels qui utilisent encore le shim ;
2. supprimer progressivement les usages restants ;
3. retirer ensuite la dépendance `@supabase/supabase-js` du frontend quand plus aucun usage n’est nécessaire.
