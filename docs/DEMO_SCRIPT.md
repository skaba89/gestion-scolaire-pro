# Script de démonstration — École guinéenne (20 minutes)

## Préparation (avant le rendez-vous)

1. Stack démarré : `docker compose --env-file .env.docker up -d` — tous healthy
2. Navigateur en fenêtre privée (aucun cache)
3. Comptes prêts :
   - Super admin : `ADMIN_DEFAULT_EMAIL` / `ADMIN_DEFAULT_PASSWORD` (voir .env.docker)
   - Un tenant de démo déjà créé la veille (filet de sécurité si le réseau lâche)

## Déroulé

### 1. Accroche (2 min) — page publique `/`

- Montrer le hero : « La gestion scolaire moderne pour les établissements guinéens »
- Souligner : essai 30 jours gratuit, pas de carte bancaire, tout en français

### 2. Création de l'établissement en direct (4 min) — `/inscription`

- Remplir : nom de l'école du prospect, type (ex. collège), email, mot de passe
- Montrer l'arrivée directe sur l'onboarding — « votre école existe déjà »

### 3. Onboarding guidé (5 min)

- Étape structure : choisir le template **« Collège (Guinée) »** → 7ème, 8ème, 9ème, 10ème
- Créer une classe (ex. « 7ème A »)
- Montrer les matières par défaut (Français, Maths, Anglais)
- Frais scolaires : cliquer les suggestions **« Frais d'inscription »**, **« Mensualité »**
  — montants en **GNF**

### 4. Vie quotidienne (6 min) — portail admin

- Inscrire un élève (admissions → validation)
- Saisir une note, générer un **bulletin PDF**
- Créer une facture de mensualité, encaisser un paiement, imprimer le **reçu PDF**
- Montrer le tableau de bord direction (effectifs, impayés, présences)

### 5. Parents & mobile (2 min)

- Portail parent : notes, présences, factures visibles côté parent
- Montrer le responsive (mode mobile du navigateur) — utilisable sur smartphone

### 6. Conclusion commerciale (1 min)

- Récap plans : Starter / Pro / Enterprise — paiement GNF, mobile money ou virement
- L'essai Pro 30 jours court déjà — « vous gardez tout ce qu'on vient de créer »
- Prochaine étape : formation du secrétariat (1/2 journée), import CSV des élèves

## Pièges à éviter

- Ne PAS montrer les modules marqués **Bêta** sauf demande explicite
- Ne pas promettre le reporting ministère (Bêta)
- Si le réseau est lent : basculer sur le tenant de démo préparé la veille
