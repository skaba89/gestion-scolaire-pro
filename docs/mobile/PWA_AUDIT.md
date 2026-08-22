# Audit PWA / Mobile — Phase 6 (issue #23)

Audit du 15/07/2026 — état réel du terrain mobile/offline par rapport au
périmètre de l'issue #23 (écrite en mai 2026 ; plusieurs items ont été
livrés depuis par les phases 2-4).

## 1. Architecture service worker actuelle

| Fichier (`public/`) | Rôle | Actif ? |
|---|---|---|
| `sw-schoolflow.js` | SW maison : Cache-First assets statiques, Network-First navigation. Enregistré par `src/main.tsx` en production uniquement. | ✅ **actif** |
| `sw-killer.js` | Chargé par `index.html` : désinscrit les anciens SW corrompus au chargement. | ✅ actif (nettoyage) |
| `sw.js`, `service-worker.js` | Reliquats d'itérations précédentes. | ⚠️ morts, à supprimer |
| SW généré par VitePWA | Workbox `autoUpdate`, denylist API complète, CacheFirst statique 7 j. | ⛔ seulement si `VITE_ENABLE_PWA=true` en build prod |

**Garanties acquises** : aucun SW n'intercepte `/api/*` (denylist Workbox +
logique équivalente dans `sw-schoolflow.js`) — le risque historique « la PWA
casse l'auth/les appels API » est traité. `main.tsx` gère aussi un reset
forcé des SW (`forceServiceWorkerReset`).

**Risque identifié** : si `VITE_ENABLE_PWA=true`, deux service workers
cohabitent (`sw.js` Workbox + `sw-schoolflow.js` manuel). Le dernier
enregistré gagne le scope `/`, mais le comportement devient dépendant de
l'ordre d'exécution. → Recommandation : choisir UN des deux mécanismes
(supprimer le SW manuel si VitePWA est adopté, ou retirer le flag).

## 2. État par rapport au périmètre de l'issue

| § Issue #23 | État | Détail |
|---|---|---|
| §1 PWA fiable / installation | 🟢 largement fait | Manifest + icônes 192/512, page `/install`, `autoUpdate`, exclusions API. Capacitor 8 présent dans les dépendances (android/app/camera/core) — build natif non encore exercé en CI. |
| §2 Offline read-only | 🟠 partiel | Assets statiques cachés + `OfflineIndicator`. **Aucune donnée métier consultable offline** (React Query = cache mémoire volatile). |
| §3 Sync intelligente | 🔴 à faire | Aucune file d'attente locale ni stratégie de sync différée. |
| §4 Push + SMS | 🟢 largement fait | Push OneSignal (web + Capacitor) avec `push_subscriptions` en base. `SMSSender` avec 2 providers : Android SMS Gateway (gratuit) et Africa's Talking. Ordre de dispatch : WhatsApp → Push → SMS → Email. Reste : préférences de notification par utilisateur + journal des échecs consultable. |
| §5 Paiements locaux | 🟢 fait (et au-delà) | CinetPay + PayTech avec intents persistés et webhooks signés (PR #53), statuts pending/confirmed/failed. Depuis, la décision no-Stripe (15/07) a supprimé Stripe : les abonnements SaaS passent aussi par Mobile Money/virement (PRs #63-#66). Le point « Stripe reste international » de l'issue est obsolète. |
| §6 Mode terrain / QR | 🟠 partiel | Scanner QR présent (`QRScanner`), check-ins élèves (`student_check_ins`, router `presence`). Pas de mode kiosque/tablette dédié ni d'inscription rapide offline. |
| §7 Faible bande passante | 🟠 partiel | Compression gzip+brotli au build, routes lazy-loadées par portail, pagination API stricte. **2 chunks > 500 kB** (`index` ~575 kB, `vendor-pdf` ~623 kB) — lourds en 2G/3G. Pas de « mode lite ». |
| §8 Localisation | 🟢 fait | Devise par tenant (GNF par défaut), timezone par tenant (Africa/Conakry), 5 langues (FR défaut, EN/ES/ZH/AR), formats fr-FR. Tarification GNF livrée (PR #67). |

## 3. Reste à faire, par ordre de valeur terrain

1. **Offline read-only MVP** (PR 3 de l'issue) : persister le cache React
   Query (IndexedDB via `@tanstack/query-persist-client`) pour les données
   non sensibles du rôle courant — classes du jour, listes d'élèves,
   emploi du temps. Lecture seule, TTL court, purge au logout.
2. **File d'actions offline** (PR 4) : brouillons de présence en
   IndexedDB, rejoués vers l'API au retour réseau, validation serveur
   (l'API est déjà idempotente côté check-ins).
3. **Régime minceur bundle** (PR 2/§7) : sortir `vendor-pdf` du chemin
   critique (import dynamique au clic « exporter PDF »), scinder le chunk
   `index`, viser < 250 kB gzip au premier chargement.
4. **Préférences + journal de notifications** (PR 5/§4 restant).
5. **Mode kiosque accueil** (PR 8) : page plein écran scan QR
   entrée/sortie pour tablette, déjà réalisable avec les briques
   existantes.
6. **Nettoyage** : supprimer `public/sw.js` et `public/service-worker.js`,
   trancher VitePWA vs SW manuel (voir §1).

## 4. Sécurité (rappels de l'issue, à respecter dans les PRs suivantes)

- Jamais de données sensibles en clair dans le cache offline (limiter le
  cache aux listes non sensibles ; pas de notes/paiements offline en v1).
- Toute action rejouée depuis la file offline est revalidée côté serveur
  (permissions + tenant) au moment de la sync.
- Les SMS/push ne contiennent pas de données sensibles (templates courts).
- Chaque entrée de file offline est liée à utilisateur + tenant + appareil.

## 5. Complément — 15/08/2026

Recoupement du §1 ci-dessus avec une nouvelle lecture directe du code
(`index.html`, `public/sw.js`, `src/main.tsx`) au moment de reprendre ce
chantier. Une nuance à corriger, plus deux détails qui renforcent le
diagnostic déjà posé — rien de ce qui suit ne contredit le reste de
l'audit.

**Correction — installabilité réelle en prod par défaut** : `index.html`
ne contient aucun `<link rel="manifest">`, et aucun fichier
manifest/webmanifest n'existe dans `public/`. Le tableau du §1
("🟢 largement fait... Manifest + icônes") décrit la capacité telle que
VitePWA la fournirait — correct **si `VITE_ENABLE_PWA=true`** au build
(VitePWA injecte le manifest à la construction, donc invisible dans le
template `index.html` source). Mais ce flag vaut `false` par défaut
(`.env.example:158`, `# VITE_ENABLE_PWA=false`) : dans un build de
production standard, non explicitement configuré autrement, **il n'y a
pas de manifest lié et l'app n'est donc pas installable** — la page
`/install` existe et est prête, mais son `beforeinstallprompt` ne se
déclenchera pas tant que ce gap n'est pas comblé (soit en activant
VitePWA, soit en ajoutant un manifest statique indépendant).

**Détail — cause racine de l'incident, documentée dans le code lui-même** :
le commentaire en tête de `public/sw.js` précise que l'ancienne
implémentation Workbox avait `event.respondWith(fetch(event.request))`,
interceptant toutes les requêtes et causant les erreurs "Failed to
fetch", en particulier pendant les cold starts Render. `sw.js` (le SW
« killer ») n'enregistre volontairement aucun handler `fetch` — le
navigateur traite alors toutes les requêtes normalement.

**Détail — le reset forcé n'est pas qu'un flag optionnel** :
`forceServiceWorkerReset` (`src/main.tsx:56-58`) vaut vrai par défaut
sur tout domaine `*.onrender.com` (le domaine de production actuel), pas
seulement via `VITE_FORCE_SW_RESET=true`. C'est donc une protection
permanente active sur la prod réelle aujourd'hui, pas un filet de
sécurité rarement déclenché — cohérent avec le risque de double-SW déjà
signalé au §1, et à réévaluer avec le reste de l'action "Nettoyage" du §3.

Vérifié au passage : `src/offline/__tests__/outbox.test.ts` (la file
d'attente offline mentionnée au §2/§3) passe 16/16 — la brique
applicative existe et fonctionne, elle est simplement indépendante du
service worker (confirmé, cohérent avec le constat déjà posé).

## 6. Complément — 22/08/2026 : manifeste ajouté, installabilité réelle

Le gap du §5 (aucun `<link rel="manifest">`, app non installable en
build standard) est comblé : `public/manifest.webmanifest` ajouté
(statique, indépendant de VitePWA — pas de réactivation de Workbox,
donc aucun changement au risque de double-SW déjà documenté au §1),
et lié dans `index.html`. `/install` peut désormais recevoir un vrai
`beforeinstallprompt`.

**Dette assumée dans ce correctif, à ne pas oublier** : les deux
fichiers d'icônes référencés (`public/pwa-192x192.png`,
`public/pwa-512x512.png`) sont en réalité encodés en JPEG malgré leur
extension `.png`, et `pwa-192x192.png` fait 1024×1024 px réels (pas
192×192 comme son nom l'indique — `pwa-512x512.png` est correct en
dimensions). Le manifeste déclare les tailles réelles (1024×1024 et
512×512) pour rester honnête et fonctionnel plutôt que de mentir sur
`sizes`, mais ça reste un contournement : `pwa-192x192.png` pèse donc
inutilement plus lourd que nécessaire à chaque premier chargement —
notable vu la contrainte bande passante du §7. Régénérer les deux
fichiers en PNG véritable aux dimensions annoncées par leur nom est
un correctif propre et sans risque, mais nécessite un outil de
traitement d'image (indisponible dans cet environnement au moment de
ce correctif) — signalé séparément.
