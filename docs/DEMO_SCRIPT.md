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
- Ne pas promettre le reporting ministère (Bêta) — voir `docs/MINISTRY_DASHBOARD_READINESS.md`, préfecture/commune n'existent pas encore
- Ne pas promettre un paiement en ligne réel (Orange Money/Wave) sans avoir testé avec un compte marchand réel — le paiement manuel contrôlé est le chemin sûr en démo (voir `docs/PAYMENTS_READINESS.md`)
- Ne pas promettre l'import Enseignants/Parents comme "prêt" — seul l'import Élèves est construit et testé (voir `docs/IMPORT_EXCEL_READINESS.md`)
- Si le réseau est lent : basculer sur le tenant de démo préparé la veille

---

## Version courte — 10 minutes (prospect pressé, premier contact)

Objectif : montrer la valeur en un minimum de clics, pas l'exhaustivité.

1. **Accroche** (1 min) — page publique, essai gratuit sans CB.
2. **Onboarding accéléré** (3 min) — créer l'établissement, template de niveaux prédéfini, une classe, une matière (sauter la personnalisation fine).
3. **Un élève, une note, un bulletin** (3 min) — inscrire un élève, saisir une note, générer le bulletin PDF.
4. **Un paiement, un reçu** (2 min) — encaisser un paiement, montrer le reçu numéroté.
5. **Conclusion** (1 min) — plans tarifaires, essai 30 jours déjà lancé.

Ne pas ouvrir le portail parent ni le dashboard direction dans cette version — garder pour un second rendez-vous si l'intérêt est confirmé.

## Version longue — 30 minutes (comité de direction, décision collégiale)

Reprendre le script 20 minutes ci-dessus intégralement, puis ajouter :

- **Dashboard direction approfondi** (5 min) : élèves à risque, tableau des impayés, tendance de présence — montrer `docs/DIRECTION_DASHBOARD_READINESS.md` comme preuve que c'est du réel, pas une maquette.
- **Import Excel** (3 min) : télécharger le modèle, importer 5 élèves de test, montrer le rapport d'import avec une ligne volontairement en erreur pour prouver la validation.
- **Questions/réponses** (2 min) : garder du temps, c'est souvent là que se joue la décision.

## Scénarios par rôle

Chaque scénario suppose l'établissement de démo déjà créé (voir préparation ci-dessus).

### Scénario Directeur
Dashboard direction → élèves à risque → impayés → génération d'un bulletin en un clic depuis la fiche élève. Message clé : "vous voyez la santé de votre établissement en un coup d'œil, pas besoin d'Excel."

### Scénario Enseignant
Connexion avec un compte enseignant → emploi du temps → appel de présence (marquer 2-3 absences) → saisie de notes sur une évaluation. Message clé : "moins de 2 minutes pour faire l'appel d'une classe."

### Scénario Parent
Connexion portail parent (`/{slug}/auth`) → notes de l'enfant → absences → facture en attente → bouton payer (s'arrêter avant le paiement réel en démo, montrer l'écran). Message clé : "le parent n'a plus besoin d'appeler l'école pour savoir où en est son enfant."

### Scénario Comptable
Liste des factures → filtrage impayés → enregistrement d'un paiement partiel → génération du reçu → export CSV des paiements du mois. Message clé : "chaque franc est tracé, rien n'est jamais supprimé, tout est audité."

### Scénario Ministère (si applicable — prospect institutionnel)
Connexion `MINISTRY_ADMIN` → vue d'ensemble nationale (nombre d'établissements, actifs/inactifs, répartition par région) → export CSV. **Ne pas** promettre la vue préfecture/commune (non construite) ni les KPI de présence/réussite nationaux sans les avoir vérifiés au préalable — voir `docs/MINISTRY_DASHBOARD_READINESS.md`.

## Données de test recommandées

Créer à l'avance (pas en direct) pour fiabiliser la démo :
- 1 tenant "démo" avec onboarding déjà complété (filet de sécurité réseau).
- 10-15 élèves avec des notes variées (pour que "élèves à risque" affiche quelque chose de convaincant).
- 2-3 factures en retard (pour que le tableau des impayés ne soit pas vide).
- 1 paiement déjà encaissé avec reçu généré (pour montrer un reçu sans avoir à en créer un en direct si le temps manque).

## Prérequis techniques

- Stack Docker démarrée et `/health/ready` vérifié avant chaque démo (pas pendant).
- Connexion internet stable ou tenant de démo pré-chargé en secours.
- Navigateur en fenêtre privée, résolution testée si projection sur écran de salle.
