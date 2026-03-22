# Guide de Configuration CI/CD & Déploiement

Ce document détaille les étapes nécessaires pour configurer et maintenir la pipeline d'intégration et de livraison continue (CI/CD) de **SchoolFlow Pro**.

## Pipeline GitHub Actions

Le workflow `.github/workflows/ci-cd.yml` automatise les vérifications suivantes à chaque push ou pull request :
1.  **Supabase SQL Lint** : Validation des migrations de base de données.
2.  **Lint & Type Check** : Respect des standards ESLint et TypeScript.
3.  **Tests Vitest** : Exécution des tests unitaires et intégration.
4.  **Security Scan** : Analyse des vulnérabilités via Snyk.
5.  **Build & Performance** : Analyse de la taille du bundle Vite.

---

## Configuration des Secrets GitHub

Pour que le workflow fonctionne pleinement, les secrets suivants doivent être configurés dans les paramètres de votre dépôt GitHub (`Settings > Secrets and variables > Actions`) :

### 🔐 Authentification & Infrastrucure
- `GITHUB_TOKEN` : Automatiquement fourni par GitHub.
- `SUPABASE_ACCESS_TOKEN` : Requis pour le déploiement des fonctions Edge.
- `VERCEL_TOKEN` : Token d'API Vercel pour le déploiement frontend.
- `VERCEL_ORG_ID` : ID de l'organisation sur Vercel.
- `VERCEL_PROJECT_ID_PROD` : ID du projet de production sur Vercel.
- `VERCEL_PROJECT_ID_STAGING` : ID du projet de staging sur Vercel.

### 📊 Monitoring & Qualité
- `SENTRY_AUTH_TOKEN` : Pour l'upload des sourcemaps.
- `SONAR_TOKEN` : Pour les analyses de qualité SonarCloud.
- `SNYK_TOKEN` : Pour les scans de vulnérabilités.
- `CODECOV_TOKEN` : Pour le rapport de couverture de tests.

### 🌐 Environnement (Build-time)
- `PROD_SUPABASE_URL` : URL de votre instance Supabase de production.
- `PROD_SUPABASE_KEY` : Clé anonyme de production.
- `STAGING_SUPABASE_URL` : URL de l'instance de staging.
- `STAGING_SUPABASE_KEY` : Clé anonyme de staging.

---

## Déploiement "Zero-Touch" Local

Le fichier `docker-compose.yml` inclut des `healthcheck` pour garantir une résilience maximale :
- **DB** : Attente de la disponibilité de PostgreSQL.
- **Keycloak** : Le frontend et l'auth n'acceptent les connexions que lorsque l'identifiant souverain est prêt.
- **PgBouncer** : Pooler de connexion managé pour la performance.

### Démarrage Rapide
```bash
cp .env.template .env
docker compose up -d
```
