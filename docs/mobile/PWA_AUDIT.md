# Audit PWA / Service Worker — Phase 6 PR1 (issue #23)

État réel constaté dans le code au 15/08/2026 — pas une évaluation
théorique. Chaque affirmation ci-dessous cite le fichier source.

## Résumé

Il y a déjà eu un vrai incident en production causé par le service
worker Workbox/VitePWA d'origine, et le code porte encore les traces de
la correction d'urgence. L'app fonctionne aujourd'hui grâce à un service
worker réécrit à la main, volontairement minimal, qui exclut
explicitement tout le trafic API. La synchronisation offline réelle
(présence, notes, brouillons) est gérée à un autre niveau — IndexedDB
côté application — indépendamment du service worker. Le gap le plus
concret : l'app n'est **pas installable** aujourd'hui (pas de manifest
lié), alors que les icônes PWA existent déjà.

## 1. L'incident et sa correction (déjà en prod)

Le commentaire en tête de [`public/sw-schoolflow.js`](../../public/sw-schoolflow.js) est explicite :

> "This SW solves the 'Failed to fetch' error from previous Workbox
> implementation by explicitly excluding all API traffic."

Traces concrètes de cet incident, toutes actives en production aujourd'hui :

- **[`public/sw-killer.js`](../../public/sw-killer.js)** — chargé sans
  condition dans `index.html` (ligne 76), avant tout code applicatif.
  Désinscrit **tous** les service workers existants et vide **tous** les
  caches, sur **chaque** chargement de page, pour **chaque** visiteur.
  C'est un nettoyage permanent, pas un correctif ponctuel qui aurait été
  retiré après coup.
- **[`src/main.tsx:56-58`](../../src/main.tsx)** —
  `forceServiceWorkerReset` est vrai par défaut sur tout domaine
  `*.onrender.com` (le domaine de production actuel), pas seulement via
  un flag d'urgence optionnel. Sur Render, un second mécanisme
  d'auto-désinscription se déclenche systématiquement (`sw.js`,
  registered puis auto-unregister après nettoyage des caches).

**Coût réel de cette double protection** : deux passes de nettoyage
(désinscription + vidage de cache) à chaque chargement sur le domaine de
prod actuel, avant même que le vrai service worker offline puisse
s'enregistrer (délai de 3s ajouté exprès, `swDelay` ligne 130). C'est
volontairement défensif — mais ça mérite d'être révisé une fois qu'on
aura confirmé, sur plusieurs semaines de métriques, que le nouveau SW ne
reproduit pas l'incident d'origine.

## 2. Le service worker actuel — `sw-schoolflow.js`

Écrit à la main (pas généré par Workbox), 163 lignes, versionné
`schoolflow-offline-v4`. Stratégie explicite par type de requête :

| Type de requête | Stratégie | Détail |
|---|---|---|
| Assets statiques (JS/CSS/fonts/images, `/assets/*`) | Cache-First | Sert depuis le cache, met à jour en arrière-plan |
| Navigation (HTML) | Network-First | Fallback vers `index.html` en cache si hors-ligne |
| API (`/api/v1/`, `localhost:8000`, `*.onrender.com`, `*.railway.app`, `*.fly.dev`, `/api-proxy/`) | **Jamais interceptée** | Passe directement au réseau |

L'allowlist de domaines API (`API_PATTERNS`, ligne 18-25) couvre les
plateformes d'hébergement effectivement utilisées par ce projet — c'est
une exclusion positive et vérifiable, pas un `try/catch` générique qui
masquerait un vrai bug d'interception plus tard.

**Enregistrement** ([`src/main.tsx:128-150`](../../src/main.tsx)) :
uniquement en dehors du mode dev (`!import.meta.env.DEV`), avec gestion
`SKIP_WAITING` pour activer une nouvelle version dès qu'elle est prête —
évite qu'un utilisateur reste bloqué sur une ancienne version du SW
après un déploiement.

## 3. VitePWA/Workbox — présent mais désactivé par défaut

[`vite.config.ts:15`](../../vite.config.ts) :
```ts
const enablePwa = mode === 'production' && env.VITE_ENABLE_PWA === 'true';
```
Le plugin `vite-plugin-pwa` (Workbox) est toujours dans les dépendances
et configuré (exclusions API déjà présentes dans sa config aussi, lignes
64-66), mais **n'est actif que si `VITE_ENABLE_PWA=true` est explicitement
positionné sur un build de production**. `.env.example:158` documente la
variable mais commentée avec `false` (`# VITE_ENABLE_PWA=false`) — un
choix par défaut délibéré, pas un oubli. En clair : le SW qui tourne
réellement en prod aujourd'hui est `sw-schoolflow.js` (fait main), pas la
sortie de Workbox.

La cause racine de l'incident d'origine est documentée noir sur blanc
dans `public/sw.js` : l'ancienne version du SW avait
`event.respondWith(fetch(event.request))` qui interceptait **toutes**
les requêtes, provoquant des erreurs "Failed to fetch" — en particulier
pendant les cold starts Render ou quand le SW était dans un état
intermédiaire. `sw.js` (le "killer") n'enregistre volontairement **aucun**
handler `fetch` — le navigateur traite alors toutes les requêtes
normalement, en contournant totalement le SW.

## 4. Gap concret : pas de manifest lié, app non installable

`index.html` référence des icônes PWA (`apple-touch-icon` 192×192 et
512×512, lignes 12/46-47, plus `theme-color` ligne 38) mais **aucun**
`<link rel="manifest" ...>`. Sans manifest lié, aucun navigateur ne
proposera l'installation ("Ajouter à l'écran d'accueil") — un des
objectifs explicites du périmètre Phase 6 ("Mobile-first et PWA
fiable... Ajouter installation mobile propre").

C'est le SEUL vrai composant manquant d'une PWA installable de base : les
icônes existent, le SW existe et fonctionne, la stratégie de cache est
saine. Il manque le manifest et son lien dans `index.html`.

## 5. Synchronisation offline — déjà construite, séparément du SW

Contrairement à ce qu'on pourrait attendre, la synchro offline (présence,
brouillons de messages, etc. — le périmètre "Offline-first progressif"
de l'issue) **n'est pas** gérée par le service worker : elle vit dans
`src/offline/` (`outbox.ts`, `syncEngine.ts`), avec une base IndexedDB
locale (Dexie, vu dans les tests). Vérifié fonctionnel : 16/16 tests
passent sur `src/offline/__tests__/outbox.test.ts` au moment de cet
audit — file d'attente locale avec idempotence (`X-Idempotency-Key`),
rejeu en séquence, vidage après succès.

C'est une architecture saine : le SW gère uniquement le "app shell"
(assets + navigation offline), la queue applicative gère les écritures
métier différées. Découplage déjà en place, pas à construire.

## 6. Ce qui reste réellement à faire (périmètre Phase 6 restant)

Sur la base de ce constat, l'ordre de priorité réaliste pour la suite du
chantier PWA/mobile :

1. **Manifest + lien `<link rel="manifest">`** — le gap le plus concret
   et le moins risqué à combler (PR2 du découpage de l'issue).
2. **Décider si Workbox/VitePWA reste désactivé définitivement** ou si
   `VITE_ENABLE_PWA=true` a vocation à être réactivé un jour —
   `vite-plugin-pwa` est une dépendance de build (n'alourdit pas le
   bundle expédié au navigateur tant qu'elle reste désactivée), donc pas
   d'urgence à la retirer ; mais si la décision est "jamais", autant
   la retirer de `package.json` pour ne pas laisser une config Workbox
   orpheline que personne ne maintient.
3. **Réévaluer le double kill-switch** (`sw-killer.js` + `sw.js` +
   `forceServiceWorkerReset` sur Render) après une période d'observation
   sans régression — actuellement une défense permanente contre un
   incident passé, pas nécessairement encore justifiée indéfiniment.
4. Le reste du périmètre Phase 6 (offline write actions au-delà de ce
   qui existe déjà, notifications push/SMS, Mobile Money, mode terrain,
   optimisation bande passante, localisation Afrique) — non couvert par
   cet audit, chacun mérite son propre PR selon le découpage de l'issue.

## Sources

- `public/sw-killer.js`
- `public/sw-schoolflow.js`
- `public/sw.js`
- `src/main.tsx` (lignes 54-151)
- `vite.config.ts` (lignes 1-91)
- `index.html`
- `src/offline/__tests__/outbox.test.ts` (résultat de run réel, 15/08/2026)
