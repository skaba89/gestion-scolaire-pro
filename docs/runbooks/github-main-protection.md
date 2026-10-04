# Runbook — protection de la branche `main` (GitHub)

**Statut : préparé, NON appliqué.** Opération administrative : à exécuter par
le propriétaire du dépôt, après validation explicite.

## Constat (2026-10-04)

`GET /repos/skaba89/gestion-scolaire-pro/branches/main/protection` → `404
Branch not protected` ; aucun ruleset. Conséquences observées : les PR #267,
#268 et #269 ont été fusionnées pendant que leurs contrôles étaient encore en
cours, et rien n'empêche un push direct ou un force-push sur `main`.

## Règles recommandées (ruleset de dépôt)

| Règle | Valeur | Pourquoi |
|---|---|---|
| PR obligatoire | oui | plus de push direct |
| Approbations requises | 1 (voir « mainteneur unique » ci-dessous) | revue humaine |
| Rejeter les approbations obsolètes au nouveau push | oui | la revue porte sur le code fusionné |
| Résolution des conversations | obligatoire | aucun commentaire de revue ignoré |
| Checks requis | `Backend`, `Backend Tests (PostgreSQL)`, `Frontend`, `Security Scan`, `Browser Smoke (Playwright)` | noms exacts des jobs de `ci.yml` |
| Branche à jour avant fusion (`strict`) | oui | les checks portent sur le résultat réel de la fusion |
| Historique linéaire | oui (squash, déjà la pratique) | — |
| Suppression de `main` | interdite | — |
| Force-push | interdit | — |

CodeQL n'est pas configuré (`code-scanning/default-setup` = `not-configured`) :
l'activer (Settings → Code security → CodeQL, setup par défaut) puis l'ajouter
aux checks requis.

### Mainteneur unique

Avec une seule personne ayant les droits d'écriture, « 1 approbation requise »
bloque toute fusion (GitHub interdit l'auto-approbation). Choix possibles :
1. **Recommandé** : ajouter un second relecteur (compte distinct) ;
2. sinon, garder `required_approving_review_count: 0` mais **tous les checks
   requis + PR obligatoire + conversation resolution** (protège déjà contre
   la fusion pendant que la CI tourne, le push direct et le force-push), et
   ajouter le propriétaire en `bypass_actors` uniquement pour l'urgence.

## Commande (NE PAS exécuter sans validation)

```bash
gh api -X POST repos/skaba89/gestion-scolaire-pro/rulesets --input - <<'JSON'
{
  "name": "protect-main",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/heads/main"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    { "type": "required_linear_history" },
    { "type": "pull_request", "parameters": {
        "required_approving_review_count": 1,
        "dismiss_stale_reviews_on_push": true,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": true } },
    { "type": "required_status_checks", "parameters": {
        "strict_required_status_checks_policy": true,
        "required_status_checks": [
          { "context": "Backend" },
          { "context": "Backend Tests (PostgreSQL)" },
          { "context": "Frontend" },
          { "context": "Security Scan" },
          { "context": "Browser Smoke (Playwright)" } ] } }
  ],
  "bypass_actors": []
}
JSON
```

Vérification : `gh api repos/skaba89/gestion-scolaire-pro/rulesets` puis une
PR de test (fusion refusée tant qu'un check est en cours / en échec).
Rollback : `gh api -X DELETE repos/skaba89/gestion-scolaire-pro/rulesets/<id>`.

## Environnements GitHub

`deploy-appservice.yml` et `deploy-azure.yml` utilisent des GitHub
Environments : configurer `production` (et `prod` si `deploy-azure.yml` est
conservé) avec **relecteurs obligatoires** — aujourd'hui `Production` n'a
aucune règle et `prod` n'existe pas.
