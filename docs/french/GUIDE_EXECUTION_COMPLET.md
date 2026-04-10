# 🚀 Guide d'Exécution du Plan de Test - 2 Universités

**Date**: 26 Janvier 2026  
**Durée Estimée**: 3-4 jours  
**Objectif**: Tester complètement SchoolFlow Pro avec 2 universités distinctes + versions mobiles

---

## ✅ CHECKLIST PRÉ-TEST

Avant de commencer, vérifier:

- [ ] Docker est installé et fonctionne
- [ ] `docker-compose up` en cours (14 services actifs)
- [ ] Supabase Studio accessible: http://localhost:3001/
- [ ] Frontend dev: http://localhost:8080/
- [ ] Node.js v18+ installé
- [ ] Python 3.9+ installé
- [ ] Android Studio ou Xcode disponible (pour mobile)
- [ ] Plan de test imprimé: [PLAN_TEST_COMPLET_2UNIVERSITES.md](PLAN_TEST_COMPLET_2UNIVERSITES.md)

---

## 📋 ÉTAPE 1: Préparer les Données (1-2 heures)

### 1.1 Créer les universités de base

**Ouvrir Supabase Studio**: http://localhost:3001/

Accéder à **SQL Editor** et exécuter:

```bash
# Copier le contenu de ce fichier dans Supabase SQL Editor
cat scripts/insert_2_universities_complete.sql
```

**OU utiliser psql directement:**
```bash
# Accéder à la base de données
psql -h localhost -U postgres -d postgres

# Exécuter le script
\i scripts/insert_2_universities_complete.sql

# Vérifier
SELECT name, slug FROM public.tenants;
```

✅ **Résultat attendu:**
```
Université de Paris Sorbonne | sorbonne-paris
Universidad Nacional de Colombia | unal-colombia
```

### 1.2 Créer les utilisateurs de test

**Générer les fichiers SQL et credentials:**
```bash
cd c:\Users\cheic\Documents\EduSchool\schoolflow-pro

# Exécuter le script Python
python scripts/create_test_users.py
```

**Résultat**: 2 fichiers générés
- `scripts/insert_test_users.sql` - Script SQL avec 72 utilisateurs
- `scripts/TEST_CREDENTIALS_2UNIVERSITIES.md` - Identifiants de connexion

### 1.3 Importer les utilisateurs

**Via Supabase Studio:**
```bash
# Ouvrir SQL Editor et exécuter:
\i scripts/insert_test_users.sql
```

**OU via terminal psql:**
```bash
psql -h localhost -U postgres -d postgres < scripts/insert_test_users.sql
```

✅ **Résultat attendu:**
```
Total utilisateurs créés: 72
- TENANT_ADMIN: 2
- DIRECTOR: 4
- TEACHER: 10
- STUDENT: 40
- PARENT: 16
```

### 1.4 Vérifier les données

**Ouvrir Adminer**: http://localhost:8082/

Connexion:
- **Serveur**: `schoolflow-pro-supabase-db-1` (ou `localhost`)
- **Utilisateur**: `postgres`
- **Mot de passe**: `postgres`
- **Base**: `postgres`

**Vérifier:**
- [ ] Table `tenants` - 2 universités
- [ ] Table `departments` - 6 départements (3 par univ)
- [ ] Table `levels` - 11 niveaux
- [ ] Table `classrooms` - 6 classes
- [ ] Table `subjects` - 12 matières
- [ ] Table `profiles` - 72 utilisateurs
- [ ] Table `user_roles` - 72 rôles assignés

---

## 🧪 ÉTAPE 2: Tests Administrateur (4-5 heures)

### 2.1 Login Administrateur Sorbonne

**1. Ouvrir frontend**: http://localhost:8080/

**2. Écran Login visible:**
- [ ] Logo SchoolFlow Pro
- [ ] Champ Email
- [ ] Champ Mot de passe
- [ ] Bouton "Se connecter"

**3. Connexion:**
```
Email: admin@sorbonne.fr
Mot de passe: Sorbonne@2025!
```

**4. Vérifier connexion réussie:**
- [ ] Redirection vers Dashboard Admin
- [ ] "Université de Paris Sorbonne" en header
- [ ] Menu latéral visible
- [ ] Pas d'erreurs en console (F12)

**5. Prendre screenshot** pour rapport

### 2.2 Tester Fonctionnalités Admin

**Menu Facultés:**
```
1. Cliquer "Facultés" en sidebar
2. Vérifier 3 facultés listées:
   ✓ Sciences
   ✓ Lettres  
   ✓ Droit
3. Cliquer "Sciences" → voir détails
4. Cliquer "Éditer" → modifier description
5. Sauvegarder → vérifier changement
6. Retour liste → vérifier maj
```

**Menu Niveaux:**
```
1. Cliquer "Niveaux"
2. Vérifier 5 niveaux listés:
   ✓ Licence 1
   ✓ Licence 2
   ✓ Licence 3
   ✓ Master 1
   ✓ Master 2
3. Créer nouveau niveau "Master 3"
4. Sauvegarder
5. Vérifier ajout liste
6. Supprimer "Master 3"
7. Vérifier suppression
```

**Menu Classes:**
```
1. Cliquer "Classes"
2. Vérifier 3 classes listées:
   ✓ L1-Sciences-A (Sciences, L1)
   ✓ L1-Sciences-B (Sciences, L1)
   ✓ L2-Lettres-A (Lettres, L2)
3. Éditer L1-Sciences-A → Capacité = 40
4. Sauvegarder
5. Vérifier maj
```

**Menu Matières:**
```
1. Cliquer "Matières"
2. Vérifier 6 matières listées:
   ✓ Mathématiques I
   ✓ Chimie Générale
   ✓ Physique I
   ✓ Littérature Française
   ✓ Histoire
   ✓ Philosophie
3. Créer nouvelle matière:
   - Nom: "Anglais I"
   - Code: "ENG-101"
   - Crédits: 6
   - Coefficient: 1.5
4. Sauvegarder
5. Vérifier ajout
```

**Menu Utilisateurs:**
```
1. Cliquer "Utilisateurs"
2. Vérifier liste complète:
   - Admin: Jean Dupont (1)
   - Directeurs: Sophie Martin, Pierre Leclerc (2)
   - Professeurs: Claude Renault, etc. (5)
   - Étudiants: Alice Blanc, etc. (20)
   - Parents: Anne Blanc, etc. (8)
3. Rechercher "Claude" → trouver prof
4. Éditer Claude Renault → ajouter téléphone
5. Sauvegarder
6. Vérifier maj
7. Créer nouvel utilisateur:
   - Email: test.user@sorbonne.fr
   - Nom: Test User
   - Rôle: TEACHER
8. Sauvegarder
9. Vérifier ajout
10. Supprimer test.user@sorbonne.fr
```

**Menu Années Académiques:**
```
1. Cliquer "Années Académiques"
2. Vérifier "2025-2026" listée
3. Éditer → voir trimestres
4. Créer année "2026-2027"
5. Créer trimestres T1, T2, T3
6. Sauvegarder
7. Vérifier ajout
```

**Menu Paramètres Système:**
```
1. Cliquer "Paramètres"
2. Onglet "Généralités":
   - Vérifier Nom: "Université de Paris Sorbonne"
   - Vérifier Logo: Image affichée
   - Éditer Adresse
   - Sauvegarder
3. Onglet "Académique":
   - Vérifier année active: "2025-2026"
   - Vérifier pays: "France"
   - Vérifier devise: "EUR"
   - Vérifier fuseau: "Europe/Paris"
4. Onglet "Notifications":
   - Vérifier notifications activées
   - Éditer destinataires email
   - Sauvegarder
5. Prendre screenshot paramètres
```

### 2.3 Documenter Résultats

**Créer fichier**: `TEST_RESULTS_SORBONNE_ADMIN.md`

```markdown
# Test Administrateur - Sorbonne
Date: [Date]
Testeur: [Nom]

## ✅ Fonctionnalités Validées

- [x] Authentification Admin: PASS
- [x] Affichage Université Sorbonne: PASS
- [x] Menu Facultés: PASS (3/3 visibles)
- [x] Menu Niveaux: PASS (5/5 visibles, création OK)
- [x] Menu Classes: PASS (3/3 visibles)
- [x] Menu Matières: PASS (6/6 visibles, création OK)
- [x] Menu Utilisateurs: PASS (36/36 visibles)
- [x] Menu Paramètres: PASS (tous modifiables)
- [x] Années Académiques: PASS (création OK)

## ⚠️ Problèmes Rencontrés

(Lister les problèmes ici)

## 📸 Screenshots

(Ajouter screenshots ici)
```

### 2.4 Tester Admin Colombia

**Répéter 2.1-2.3 avec:**
```
Email: admin@unal.edu.co
Mot de passe: Colombia@2025!
```

**Vérification critique:**
```
✓ "Universidad Nacional de Colombia" en header
✓ 3 facultés Colombia (Ingeniería, Salud, Economía)
✓ 6 niveaux Colombia (Semestre 1-6)
✓ 3 classes Colombia
✓ 6 matières Colombia (Cálculo, Programación, etc.)
✓ 18 utilisateurs Colombia
✓ Devise COP (pas EUR)
```

---

## 👨‍🏫 ÉTAPE 3: Tests Enseignant (3-4 heures)

### 3.1 Login Professeur

**Connexion:**
```
Email: diego.martinez@unal.edu.co
Mot de passe: Diego@2025!
Université: Colombia
```

**Vérifier:**
- [ ] Dashboard Professeur visible
- [ ] Pas d'accès Admin
- [ ] "Mes Classes" affichées

### 3.2 Tester Gestion Notes

**Menu "Mes Classes":**
```
1. Voir classes assignées:
   - Semestre 1 - Ingeniería A
   - Semestre 1 - Ingeniería B
2. Cliquer "Semestre 1 - Ingeniería A"
3. Voir liste 10 étudiants
```

**Saisir Notes:**
```
1. Cliquer "Évaluation T1"
2. Saisir notes:
   - Andrés: 18/20
   - Beatriz: 15/20
   - Carmen: 17/20
   - Diego: 14/20
   - Elena: 19/20
   - Felipe: 16/20
   - Gloria: 18/20
   - Héctor: 17/20
   - Ignacio: 15/20
   - Ximena: 20/20
3. Cliquer "Sauvegarder"
4. Voir moyenne calculée automatiquement
5. Exporter notes CSV
6. Exporter notes PDF
7. Prendre screenshot
```

**Vérifier Calcul:**
```
Moyenne = (18+15+17+14+19+16+18+17+15+20) / 10 = 16.9/20 ✓
```

### 3.3 Tester Gestion Présences

**Menu "Présences":**
```
1. Sélectionner date aujourd'hui
2. Sélectionner classe "Semestre 1 - Ingeniería A"
3. Marquer présences:
   - Andrés: PRESENT
   - Beatriz: ABSENT
   - Carmen: LATE (15 min)
   - Diego: PRESENT
   - Elena: PRESENT
   - Felipe: EXCUSED
   - Gloria: PRESENT
   - Héctor: PRESENT
   - Ignacio: ABSENT
   - Ximena: PRESENT
4. Cliquer "Sauvegarder"
5. Vérifier statistiques:
   - Présents: 7/10 (70%)
   - Absents: 2
   - Retards: 1
   - Excusés: 1
6. Générer rapport
7. Exporter liste
```

### 3.4 Tester Gestion Devoirs

**Créer Devoir:**
```
1. Menu "Devoirs"
2. Cliquer "+ Nouveau Devoir"
3. Remplir:
   - Titre: "Exercices Calcul Chapitre 5"
   - Description: "Résoudre exercices 1-15 page 67"
   - Date remise: 2025-02-07
   - Points max: 20
4. Ajouter classe: "Semestre 1 - Ingeniería A"
5. Cliquer "Créer"
6. Vérifier création
```

**Noter Remises:**
```
1. Voir "Remises attendues"
2. Cliquer devoir
3. Voir 10 remises:
   - Andrés: Remis (fichier PDF)
   - Beatriz: Remis (fichier DOC)
   - ... (autres)
   - Ximena: Non remis
4. Noter Andrés: 18/20 + feedback "Excellent!"
5. Noter Beatriz: 14/20 + feedback "À améliorer"
6. Noter Carmen: 19/20
7. (Continuer pour autres)
8. Voir statistiques:
   - Taux remise: 90%
   - Moyenne: 17.2/20
   - Min: 12
   - Max: 20
9. Prendre screenshot
```

### 3.5 Tester Messages/Annonces

**Créer Annonce:**
```
1. Menu "Communications"
2. Cliquer "+ Nouvelle Annonce"
3. Remplir:
   - Titre: "Examen partiel - 28 Février"
   - Contenu: "Examen partiel Calcul 28 février 14h-16h"
   - Salle: "Salle 302"
   - Destinataires: "Semestre 1 - Ingeniería A"
4. Cliquer "Publier"
5. Vérifier publication
```

**Voir Statistiques Lecture:**
```
1. Voir "Mes Annonces"
2. Cliquer annonce "Examen partiel"
3. Voir qui a lu:
   - Andrés: Lu
   - Beatriz: Lu
   - ...
   - Ximena: Non lu
4. Voir % lu: 90%
```

### 3.6 Documenter Résultats

**Fichier**: `TEST_RESULTS_TEACHER_COLOMBIA.md`

---

## 👨‍🎓 ÉTAPE 4: Tests Étudiant (3-4 heures)

### 4.1 Login Étudiant Sorbonne

**Connexion:**
```
Email: alice.blanc@student.sorbonne.fr
Mot de passe: Alice@2025!
Université: Sorbonne
```

**Dashboard Étudiant:**
- [ ] Pas d'accès Admin/Prof
- [ ] Menu "Mes Notes"
- [ ] Menu "Mes Présences"
- [ ] Menu "Mes Devoirs"
- [ ] Menu "Messages"
- [ ] Menu "Mon Profil"

### 4.2 Tester Consultation Notes

**Menu "Mes Notes":**
```
1. Voir matières:
   - Mathématiques I: 16/20 (T1), 17/20 (T2)
   - Chimie Générale: 18/20 (T1), 19/20 (T2)
   - Physique I: 15/20 (T1), 16/20 (T2)
   - Littérature Française: 14/20 (T1), 15/20 (T2)
   - Histoire: 17/20 (T1), 16/20 (T2)
   - Philosophie: 16/20 (T1), 17/20 (T2)
2. Vérifier moyennes:
   - Mathématiques: 16.5/20
   - Chimie: 18.5/20
   - Physique: 15.5/20
   - Littérature: 14.5/20
   - Histoire: 16.5/20
   - Philosophie: 16.5/20
3. Moyenne générale: 16.4/20 ✓
4. Voir courbe progression
5. Télécharger relevé notes
```

### 4.3 Tester Consultation Présences

**Menu "Mes Présences":**
```
1. Voir résumé:
   - Total cours: 35
   - Présents: 32 (91.4%)
   - Absents: 2
   - Retards: 1
   - Excusés: 0
2. Voir historique complet
3. Voir calendrier
4. Générer certificat présence
```

### 4.4 Tester Consultation Devoirs

**Menu "Mes Devoirs":**
```
1. Voir devoirs assignés:
   - "Exercices Chapitre 3" - À remettre 2025-02-01
   - "Projet Groupe" - À remettre 2025-02-15
   - "Contrôle Continu" - À remettre 2025-02-08
2. Ouvrir "Exercices Chapitre 3"
   - Voir description
   - Voir fichiers attachés
   - Voir deadline
3. Cliquer "Remettre"
4. Uploader fichier (devoir.pdf)
5. Ajouter note personnelle
6. Cliquer "Soumettre"
7. Voir feedback prof: "18/20 - Excellent!"
8. Voir statut: "Remis à temps"
```

### 4.5 Tester Consultation Messages

**Menu "Messages":**
```
1. Voir annonces:
   - "Réunion Important - 15 Février" (Non lue)
2. Cliquer → Lire
3. Marquer comme lue
4. Voir messages privés:
   - De Prof. Claude: "Félicitations..."
5. Lire message
6. Répondre
7. Voir conversation
```

### 4.6 Tester Profil Étudiant

**Menu "Mon Profil":**
```
1. Voir données:
   - Nom: Alice Blanc
   - Email: alice.blanc@student.sorbonne.fr
   - Niveau: Licence 1
   - Classe: L1-Sciences-A
   - Année académique: 2025-2026
2. Éditer profil:
   - Téléphone: +33 6 12 34 56 78
   - Uploader photo
   - Adresse: "123 Rue de la Paix, 75001 Paris"
3. Sauvegarder
4. Vérifier maj
5. Changer mot de passe
6. Voir historique connexions
```

### 4.7 Documenter Résultats

**Fichier**: `TEST_RESULTS_STUDENT_SORBONNE.md`

---

## 👨‍👩‍👦 ÉTAPE 5: Tests Parent (2-3 heures)

### 5.1 Login Parent Colombia

**Connexion:**
```
Email: aurora.acosta@parent.unal.edu.co
Mot de passe: Aurora@2025!
Université: Colombia
```

**Interface Parent:**
- [ ] Pas d'accès Admin/Prof
- [ ] Menu "Mes Enfants"
- [ ] Menu "Suivi Scolaire"
- [ ] Menu "Messages"
- [ ] Menu "Mon Profil"

### 5.2 Lier Enfant

**Processus Liaison:**
```
1. Menu "Mes Enfants"
2. Voir message: "Aucun enfant lié"
3. Cliquer "+ Ajouter Enfant"
4. Remplir:
   - Email enfant: andres.acosta@student.unal.edu.co
5. Cliquer "Demander Liaison"
6. Voir message: "Demande envoyée en attente"
```

**Côté Étudiant:**
```
1. Login comme Andrés: andres.acosta@student.unal.edu.co
2. Menu "Demandes" ou notifications
3. Voir demande mère "Aurora Acosta"
4. Cliquer "Accepter"
5. Confirmer liaison
```

**Vérification Parent:**
```
1. Reconnecter comme Aurora
2. Actualiser page
3. Voir "Andrés Acosta" dans "Mes Enfants"
4. Cliquer → voir profil étudiant
```

### 5.3 Tester Suivi Notes Enfant

**Menu "Suivi Scolaire" → "Notes":**
```
1. Sélectionner Andrés
2. Voir notes par matière:
   - Cálculo I: 18/20, 16/20, 17/20
   - Programación: 19/20, 18/20, 20/20
   - Física I: 15/20, 16/20, 17/20
   - Anatomía I: 17/20, 18/20, 19/20
   - Biología: 16/20, 17/20, 18/20
   - Química: 18/20, 19/20, 20/20
3. Voir tendance: "📈 En progression"
4. Matières faibles: "Física I (16.0)"
5. Voir alerte si < 12: (Aucune)
```

### 5.4 Tester Suivi Présences Enfant

**Menu "Suivi Scolaire" → "Présences":**
```
1. Sélectionner Andrés
2. Voir résumé mois:
   - Présences: 18/20 (90%)
   - Absences: 2
   - Retards: 0
   - Excusés: 0
3. Voir graphique
4. Voir détail: Quels jours absent?
   - Jeudi 16 janvier (absent)
   - Mardi 21 janvier (absent)
5. Alerte si trop absent: (Aucune)
```

### 5.5 Tester Suivi Devoirs Enfant

**Menu "Suivi Scolaire" → "Devoirs":**
```
1. Sélectionner Andrés
2. Voir devoirs à remettre:
   - "Projet Calcul" - À remettre 2025-02-01
   - "Rapport Physique" - À remettre 2025-02-10
   - "Exercices Pratiques" - À remettre 2025-02-15
3. Voir devoirs remis:
   - "Exercices Chapitre 3" - 18/20 ✓
   - "Équations Différentielles" - 17/20 ✓
4. Alertes:
   - "Devoir à remettre dans 3 jours: Projet Calcul"
```

### 5.6 Tester Communications

**Menu "Messages":**
```
1. Voir messages profs:
   - De Diego Martínez: "Excellent travail en Ingeniería"
   - De Juan López: "Voir moi après le cours"
2. Lire messages
3. Répondre (si disponible)
```

### 5.7 Documenter Résultats

**Fichier**: `TEST_RESULTS_PARENT_COLOMBIA.md`

---

## 📱 ÉTAPE 6: Build Mobile (1 jour)

### 6.1 Préparer Build

```bash
cd c:\Users\cheic\Documents\EduSchool\schoolflow-pro

# Vérifier Capacitor installé
npx cap --version

# Build production
npm run build

# Vérifier dist créé
ls -la dist/
```

### 6.2 Build Android

**Prérequis:**
- Android Studio installé
- SDK level 21+
- Emulateur Android ou téléphone configuré

**Build steps:**
```bash
# Ajouter android
npx cap add android

# Copier assets
npx cap copy

# Ouvrir Android Studio
npx cap open android

# Dans Android Studio:
# 1. Build → Generate Signed Bundle / APK
# 2. Choisir APK
# 3. Signer (debug key OK pour test)
# 4. Finish

# APK généré: android/app/build/outputs/apk/debug/app-debug.apk
```

**Installer sur appareil:**
```bash
# Via ADB
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Ou via Android Studio (Run)
```

### 6.3 Tests Android

**Sur emulateur/appareil:**

```
TESTS:
✓ Splash screen 2 sec
✓ Login page affichée
✓ Email/Password inputs
✓ Se connecter fonctionne
✓ Dashboard Admin charge
✓ Université nom affichée
✓ Menu hamburger
✓ Navigation fonctionnelle
✓ Orientation portrait ✓
✓ Orientation paysage ✓
✓ Responsive layout mobile
✓ Boutons accessibles (48x48dp)
✓ Texte lisible (min 14sp)
✓ Performance < 5 sec démarrage
✓ Offline mode (activer flight mode)
✓ Push notifications
✓ Permissions (caméra, calendrier)
```

### 6.4 Build iOS (via GitHub Actions)

**Prérequis Mac/GitHub Actions:**
- Voir [GITHUB_ACTIONS_SETUP_GUIDE.md](GITHUB_ACTIONS_SETUP_GUIDE.md)
- Certificats Apple
- Provisioning profiles

**Steps:**
```bash
# Ajouter iOS
npx cap add ios

# Copier assets
npx cap copy

# Ouvrir Xcode
npx cap open ios

# Dans Xcode (sur Mac):
# 1. Select simulator/device
# 2. Product → Build
# 3. Product → Run
```

### 6.5 Documenter Résultats Mobile

**Fichier**: `TEST_RESULTS_MOBILE.md`

```markdown
# Tests Mobile - Android & iOS
Date: [Date]

## Android

### ✅ Fonctionnalités
- [x] Splash screen: PASS
- [x] Login: PASS
- [x] Dashboard Admin: PASS
- [x] Navigation: PASS
- [x] Responsivité: PASS
- [x] Performance: PASS
- [x] Offline: PASS

### ⚠️ Problèmes
(Lister ici)

### 📱 Appareils Testés
- Emulateur Pixel 4a
- Téléphone Samsung Galaxy A51

## iOS

### ✅ Fonctionnalités
- [x] Splash screen: PASS
- [x] Login: PASS
- [x] Dashboard Admin: PASS
- [x] Navigation: PASS
- [x] Responsivité: PASS
- [x] Performance: PASS
- [x] Offline: PASS

### 📱 Appareils Testés
- iPhone 14 Simulator
- iPhone SE Simulator

## Résumé
✅ Version mobile PRODUCTION READY
```

---

## 🔒 ÉTAPE 7: Tests Sécurité (2 heures)

### 7.1 SQL Injection Test

**Champ Email Input:**
```
Taper: ' OR '1'='1
Vérifier: Input écrasé/échappé
Résultat: ✓ BLOCKED
```

**Champ Password Input:**
```
Taper: '); DROP TABLE users; --
Vérifier: Pas exécuté
Résultat: ✓ BLOCKED
```

### 7.2 XSS Test

**Champ Description Faculté:**
```
Taper: <script>alert('XSS')</script>
Sauvegarder
Charger page
Vérifier: Pas d'alert, script affiché en texte
Résultat: ✓ BLOCKED
```

### 7.3 CSRF Test

**Vérifier CSRF Token:**
```
F12 → Sources
Voir formulaire
Vérifier hidden token present
Changer token, remplir form
Vérifier: Rejeté (403)
Résultat: ✓ PROTECTED
```

### 7.4 RLS Verification

**Via Adminer:**
```
Comme admin@sorbonne.fr (JWT token):
SELECT * FROM students
Vérifier: Retourne seulement étudiants Sorbonne

Comme admin@unal.edu.co (JWT token):
SELECT * FROM students
Vérifier: Retourne seulement étudiants Colombia
```

### 7.5 Documenter Résultats Sécurité

**Fichier**: `TEST_RESULTS_SECURITY.md`

---

## 📊 ÉTAPE 8: Tests Performance (2 heures)

### 8.1 Charger l'app 50 utilisateurs simultanés

```bash
# Installer K6
choco install k6

# Exécuter test
k6 run scripts/load-test.js
```

**Vérifier:**
- [ ] Réponse API moyenne < 200ms
- [ ] Réponse p95 < 500ms
- [ ] Erreurs < 0.1%
- [ ] CPU serveur < 70%
- [ ] Mémoire < 500MB

### 8.2 Web Vitals

**Via Lighthouse:**
```
1. F12 → Lighthouse
2. Mode: "Mobile"
3. Run audit
4. Vérifier:
   - FCP: < 1.5s ✓
   - LCP: < 2.5s ✓
   - CLS: < 0.1 ✓
   - TTI: < 3.8s ✓
```

### 8.3 Documenter Résultats Performance

**Fichier**: `TEST_RESULTS_PERFORMANCE.md`

---

## ✅ ÉTAPE 9: Rapport Final (2-3 heures)

### 9.1 Créer Rapport Complet

**Fichier**: `TEST_REPORT_FINAL_2UNIVERSITIES.md`

```markdown
# 📋 RAPPORT DE TEST FINAL
## 2 Universités Distinctes - SchoolFlow Pro
Date: [Date]
Durée Test: [3-4 jours]

## 📊 RÉSUMÉ EXÉCUTIF

### Objectifs
- [x] Valider 2 universités (Sorbonne + Colombia)
- [x] Tester toutes les fonctionnalités
- [x] Vérifier isolation données
- [x] Construire versions mobiles
- [x] Valider sécurité
- [x] Valider performance

### Résultats
- Universités testées: 2
- Utilisateurs testés: 72
- Fonctionnalités testées: 47
- Taux réussite: **98%**
- Blockers: **0**
- Warnings: **2** (mineurs)

## 🧪 RÉSULTATS TESTS

### Phase 1: Administrateur
- Sorbonne: ✅ PASS (35/35 tests)
- Colombia: ✅ PASS (35/35 tests)

### Phase 2: Enseignant
- Sorbonne: ✅ PASS (28/28 tests)
- Colombia: ✅ PASS (28/28 tests)

### Phase 3: Étudiant
- Sorbonne: ✅ PASS (25/25 tests)
- Colombia: ✅ PASS (25/25 tests)

### Phase 4: Parent
- Sorbonne: ✅ PASS (18/18 tests)
- Colombia: ✅ PASS (18/18 tests)

### Phase 5: Mobile
- Android: ✅ PASS (15/15 tests)
- iOS: ✅ PASS (15/15 tests)

### Phase 6: Sécurité
- SQL Injection: ✅ BLOCKED
- XSS: ✅ BLOCKED
- CSRF: ✅ PROTECTED
- RLS: ✅ ENFORCED
- HTTPS: ✅ READY

### Phase 7: Performance
- API response avg: **145ms** (< 200ms ✓)
- API response p95: **380ms** (< 500ms ✓)
- Page load: **1.2s** (< 2s ✓)
- Lighthouse score: **92** (> 85 ✓)

## 📱 VERSIONS MOBILES

- **Android**: APK généré et testé ✅
- **iOS**: IPA compilé et testé ✅
- **Offline mode**: Fonctionnel ✅
- **Push notifications**: Configurable ✅

## 🔒 CONFORMITÉ

- WCAG 2.1 Level AA: ✅
- GDPR Ready: ✅
- Data isolation: ✅
- Backup strategy: ✅

## 🎯 CONCLUSION

**VERDICT: ✅ PRODUCTION READY**

L'application SchoolFlow Pro est prête pour:
- Déploiement production
- 2+ universités simultanément
- 100+ utilisateurs
- Versions mobiles iOS/Android
- Utilisation en ligne et offline

## 📎 Annexes

- [Screenshots](screenshots/)
- [Videos](videos/)
- [Raw test data](raw_data/)

Fin du rapport.
```

### 9.2 Créer README Test

**Fichier**: `TESTING_README.md`

Documenter:
- Comment configurer environnement test
- Comment exécuter tests
- Comment reporter bugs
- Contacts support

---

## 🚀 ÉTAPE 10: Déploiement (4-6 heures)

### 10.1 Pre-Production Checklist

```
DATABASE:
- [ ] RLS actif et testé
- [ ] Backups configurés
- [ ] Monitoring actif
- [ ] Connection pooling: 100
- [ ] Indexes optimisés

BACKEND:
- [ ] HTTPS/TLS certificat valide
- [ ] CORS configuré
- [ ] Rate limiting: 100 req/min
- [ ] Logging centralisé
- [ ] Error tracking (Sentry)

FRONTEND:
- [ ] Build optimisé < 4MB
- [ ] Service Worker installé
- [ ] PWA manifeste OK
- [ ] Analytics configuré
- [ ] Performance > 85 Lighthouse

MOBILE:
- [ ] APK signé (release key)
- [ ] IPA signé
- [ ] Crash reporting
- [ ] Analytics
- [ ] App signing certificates

INFRA:
- [ ] CDN configuré
- [ ] DDoS protection
- [ ] SSL/TLS 1.3
- [ ] WAF rules
- [ ] Load balancer
- [ ] Auto-scaling
```

### 10.2 Go-Live Plan

**Samedi 22:00 UTC+1**

```
22:00 - Disable write access (read-only)
22:15 - Backup complet
22:45 - Import données test universités
23:00 - Vérifier intégrité
23:30 - Deploy app
23:45 - Smoke tests
00:00 - Enable write access
00:15 - Monitor 24h
```

---

## 📞 Support & Contacts

**En cas de problème:**

1. **Bug Frontend**: 
   - F12 → Console → Screenshot erreur
   - Note URL + étapes reproduction

2. **Bug Backend**:
   - `docker logs schoolflow-pro-api-1`
   - `docker logs schoolflow-pro-supabase-db-1`

3. **Bug Mobile**:
   - Android: `adb logcat | grep schoolflow`
   - iOS: Xcode Console

4. **Question**:
   - Voir [docs/french/](docs/french/)
   - Voir [GETTING_STARTED_FRESH.md](GETTING_STARTED_FRESH.md)

---

## ⏱️ Timeline Recap

| Étape | Durée | Statut |
|-------|-------|--------|
| 1. Préparer données | 1-2h | [ ] |
| 2. Tests admin | 4-5h | [ ] |
| 3. Tests prof | 3-4h | [ ] |
| 4. Tests étudiant | 3-4h | [ ] |
| 5. Tests parent | 2-3h | [ ] |
| 6. Build mobile | 1j | [ ] |
| 7. Tests sécurité | 2h | [ ] |
| 8. Tests performance | 2h | [ ] |
| 9. Rapport final | 2-3h | [ ] |
| 10. Déploiement | 4-6h | [ ] |
| **TOTAL** | **3-4j** | ✅ |

---

**✅ Vous êtes prêt! Commencez l'ÉTAPE 1 maintenant!**

Bon testing! 🎉
