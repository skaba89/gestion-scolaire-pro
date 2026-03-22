# SchoolFlow Pro - Édition Institutionnelle 🏛️

SchoolFlow Pro est une plateforme de gestion scolaire de nouvelle génération, durcie pour les exigences de souveraineté et de conformité de l'État.

## 🚀 Mise à Niveau Institutionnelle (Février 2026)
Le projet a subi une transformation majeure pour répondre aux standards d'appel d'offres :
- **Identité Souveraine** : Intégration de Keycloak (OIDC) pour une gestion d'identité unifiée.
- **Sécurité Critique** : Isolation inter-établissements par RLS et logs d'audit exhaustifs.
- **Conformité RGPD** : Droit à l'accès (Export JSON complet) et Droit à l'Oubli (Anonymisation cascade).
- **Business Intelligence** : Dashboard Ministère avec agrégation temps-réel via Materialized Views.

## 📚 Documentation & Guides
Retrouvez les instructions détaillées pour la démonstration :
- **[Guide de Démonstration (Démo État)](file:///C:/Users/cheic/.gemini/antigravity/brain/3629d5e3-b335-477f-beef-8f04787f1a20/demo_guide.md)**
- [Rapport d'État du Projet](file:///C:/Users/cheic/.gemini/antigravity/brain/3629d5e3-b335-477f-beef-8f04787f1a20/project_status_report.md)

## Démarrage Rapide
1.  Assurez-vous que Docker est lancé.
2.  Initialisez l'environnement : `cp .env.example .env`
3.  Lancez l'infrastructure : `docker compose up -d`
4.  Lancer le frontend : `npm i && npm run dev`

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/REPLACE_WITH_PROJECT_ID) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)
