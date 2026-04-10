# 🧪 ÉTAPE 2: Tests Administrateur - Guide d'Action

**Date**: 26 Janvier 2026  
**Durée**: 4-5 heures  
**Objectif**: Tester les fonctionnalités administrateur pour Sorbonne et UNAL

---

## ⚡ DÉMARRAGE RAPIDE

### Étape 2.1: Connexion Admin Sorbonne

1️⃣ **Ouvrir le navigateur**
```
URL: http://localhost:8080
```

2️⃣ **Vérifier l'écran de connexion**
Vous devez voir:
- [ ] Logo SchoolFlow Pro
- [ ] Champ "Email"
- [ ] Champ "Mot de passe"
- [ ] Bouton "Se connecter"
- [ ] (Optionnel) Lien "Mot de passe oublié"

3️⃣ **Entrer les identifiants Sorbonne**
```
Email: admin@sorbonne.fr
Mot de passe: Sorbonne@2025!
```

4️⃣ **Cliquer "Se connecter"**

5️⃣ **Vérifier le Dashboard Admin**
- [ ] Redirection réussie (URL contient "/dashboard" ou similaire)
- [ ] En-tête affiche: "Université de Paris Sorbonne"
- [ ] Menu latéral visible avec les options d'administration
- [ ] Pas d'erreurs en console (F12 → Onglet Console)
- [ ] Affichage des informations de l'université

✅ **Status à marquer**: Connexion réussie ✓

---

## 📋 ÉTAPE 2.2: Tester Menu Facultés/Départements

### Test Affichage
```
1. Cliquer sur "Facultés" ou "Départements" dans le sidebar
2. Vérifier les 3 départements listés:
   ✓ Sciences (code: SCI)
   ✓ Lettres (code: LET)
   ✓ Droit (code: DRO)
3. Chaque ligne doit afficher:
   - Nom du département
   - Code
   - Nombre de classes
   - Boutons d'action (Éditer, Supprimer)
```

### Test Édition
```
1. Cliquer sur "Sciences" → Voir détails
2. Cliquer "Éditer" ou stylo ✏️
3. Formulaire d'édition visible:
   - [ ] Champ Nom (pré-rempli: "Sciences")
   - [ ] Champ Code (pré-rempli: "SCI")
   - [ ] Champ Description (peut être vide)
   - [ ] Boutons "Sauvegarder" et "Annuler"
4. Modifier la description:
   ```
   Ancien: (vide ou existant)
   Nouveau: "Test description - Sciences"
   ```
5. Cliquer "Sauvegarder"
6. Vérifier la confirmation (popup ou message)
7. Retour à la liste
8. Vérifier que la description est mise à jour

✅ **Signifier CRUD complet des départements**
```

### Checklist Départements
- [ ] Affichage: 3 départements visibles
- [ ] Édition: Description modifiée et sauvegardée
- [ ] Confirmation: Message de succès affiché
- [ ] Persistance: Changement visible après rechargement

---

## 📊 ÉTAPE 2.3: Tester Menu Niveaux d'Étude

### Test Affichage
```
1. Cliquer sur "Niveaux" ou "Levels" dans le sidebar
2. Vérifier les 5 niveaux listés pour Sorbonne:
   ✓ Licence 1 (L1)
   ✓ Licence 2 (L2)
   ✓ Licence 3 (L3)
   ✓ Master 1 (M1)
   ✓ Master 2 (M2)
3. Vérifier l'ordre (L1 avant L2, etc.)
```

### Test Création
```
1. Cliquer "Ajouter Niveau" ou "+"
2. Formulaire de création:
   - [ ] Champ Nom
   - [ ] Champ Code/Numéro
   - [ ] Champ Ordre (pour le tri)
   - [ ] Boutons "Créer" et "Annuler"
3. Remplir:
   - Nom: "Master 3"
   - Code: "M3" (optionnel)
   - Ordre: "6"
4. Cliquer "Créer"
5. Vérifier confirmation
6. Vérifier "Master 3" en liste (en dernier)
```

### Test Suppression
```
1. Cliquer "Master 3" dans la liste
2. Cliquer "Supprimer" ou icône 🗑️
3. Confirmation popup:
   "Êtes-vous sûr de vouloir supprimer Master 3?"
4. Cliquer "Confirmer"
5. Vérifier "Master 3" disparu de la liste
6. Message de succès affiché
```

### Checklist Niveaux
- [ ] Affichage: 5 niveaux visibles
- [ ] Création: Master 3 ajouté à la liste
- [ ] Suppression: Master 3 supprimé de la liste
- [ ] Ordre: Niveaux triés correctement

---

## 🏫 ÉTAPE 2.4: Tester Menu Classes

### Test Affichage
```
1. Cliquer sur "Classes" dans le sidebar
2. Vérifier les 3 classes listées:
   ✓ L1-Sciences-A (Département: Sciences, Niveau: L1)
   ✓ L1-Sciences-B (Département: Sciences, Niveau: L1)
   ✓ L2-Lettres-A (Département: Lettres, Niveau: L2)
3. Chaque classe affiche:
   - Nom
   - Département
   - Niveau
   - Capacité (35, 35, 30)
   - Nombre d'étudiants
```

### Test Édition Capacité
```
1. Cliquer sur "L1-Sciences-A"
2. Cliquer "Éditer"
3. Formulaire visible:
   - [ ] Champ Nom
   - [ ] Sélecteur Département
   - [ ] Sélecteur Niveau
   - [ ] Champ Capacité
4. Modifier Capacité:
   - Ancien: 35
   - Nouveau: 40
5. Cliquer "Sauvegarder"
6. Vérifier confirmation
7. Liste: L1-Sciences-A affiche 40

✅ **Signifier édition réussie**
```

### Checklist Classes
- [ ] Affichage: 3 classes visibles
- [ ] Édition: Capacité modifiée
- [ ] Persistance: Changement visible après save

---

## 📚 ÉTAPE 2.5: Tester Menu Matières

### Test Affichage
```
1. Cliquer sur "Matières" ou "Subjects" dans le sidebar
2. Vérifier les 6 matières listées:
   ✓ Mathématiques I (MATH-101)
   ✓ Chimie Générale (CHEM-101)
   ✓ Physique I (PHYS-101)
   ✓ Littérature Française (LIT-201)
   ✓ Histoire (HIST-201)
   ✓ Philosophie (PHIL-201)
3. Chaque matière affiche:
   - Nom
   - Code
   - Crédits
   - Coefficient
```

### Test Création de Matière
```
1. Cliquer "Ajouter Matière" ou "+"
2. Formulaire:
   - [ ] Champ Nom *
   - [ ] Champ Code *
   - [ ] Champ Crédits
   - [ ] Champ Coefficient
   - [ ] Champ Description (optionnel)
   - [ ] Boutons "Créer" et "Annuler"
3. Remplir:
   - Nom: "Anglais I"
   - Code: "ENG-101"
   - Crédits: 6
   - Coefficient: 1.5
   - Description: "Cours d'anglais - Niveau 1"
4. Cliquer "Créer"
5. Vérifier confirmation
6. Liste: "Anglais I" visible (en bas généralement)
7. Vérifier tous les champs affichés correctement
```

### Test Édition Matière
```
1. Cliquer sur "Anglais I"
2. Cliquer "Éditer"
3. Formulaire d'édition:
   - [ ] Tous les champs modifiables
4. Modifier Coefficient:
   - Ancien: 1.5
   - Nouveau: 2.0
5. Cliquer "Sauvegarder"
6. Vérifier coefficient mis à jour

✅ **Signifier CRUD complet des matières**
```

### Checklist Matières
- [ ] Affichage: 6 matières visibles
- [ ] Création: "Anglais I" ajouté
- [ ] Édition: Coefficient modifié
- [ ] Persistance: Changements sauvegardés

---

## 👥 ÉTAPE 2.6: Tester Menu Utilisateurs (Optionnel)

### Test Affichage
```
1. Cliquer sur "Utilisateurs" ou "Users" dans le sidebar
2. Vérifier les 36 utilisateurs Sorbonne listés:
   - Admin: 1 (admin@sorbonne.fr)
   - Directeurs: 2
   - Enseignants: 5
   - Étudiants: 20
   - Parents: 8
3. Chaque utilisateur affiche:
   - Email
   - Nom
   - Rôle
   - Statut (Actif/Inactif)
   - Date d'ajout
```

### Test Détails Utilisateur
```
1. Cliquer sur un utilisateur (ex: claude.renault@sorbonne.fr)
2. Voir les détails:
   - [ ] Email
   - [ ] Nom complet
   - [ ] Rôle assigné: TEACHER
   - [ ] Statut: Actif
   - [ ] Date de création
   - [ ] Bouton d'édition
3. Cliquer "Éditer" (optionnel)
4. Vérifier champs modifiables:
   - Prénom
   - Nom
   - Email (probablement non-modifiable)
   - Rôle
   - Statut
```

### Checklist Utilisateurs
- [ ] Affichage: 36 utilisateurs Sorbonne
- [ ] Distribution des rôles correcte
- [ ] Détails accessibles
- [ ] Champs non sensibles modifiables

---

## 🔄 ÉTAPE 2.7: Répéter pour UNAL Colombia

**IMPORTANT**: Répétez TOUTES les tests ci-dessus pour UNAL Colombia!

### Procédure
```
1. Déconnexion Sorbonne
   - Cliquer sur profil/avatar en haut droit
   - Cliquer "Déconnexion"
   - Vérifier retour à login
2. Nouvelle connexion UNAL
   - Email: admin@unal.edu.co
   - Mot de passe: Colombia@2025!
3. Vérifier:
   - [ ] En-tête: "Universidad Nacional de Colombia"
   - [ ] 3 départements: Ingeniería, Salud, Economía
   - [ ] 6 niveaux: Semestre 1-6
   - [ ] 3 classes: Semestre 1 Ingeniería A/B, Medicina A
   - [ ] 6 matières: Cálculo I, Programación, Física I, Anatomía I, Biología, Química
   - [ ] 36 utilisateurs: 1 admin + 2 directeurs + 5 profs + 20 étudiants + 8 parents
```

### Tests UNAL (Résumé)
- [ ] Connexion réussie avec admin@unal.edu.co
- [ ] Affichage correct de "Universidad Nacional de Colombia"
- [ ] 3 départements visibles et modifiables
- [ ] 6 niveaux (semestres) visibles
- [ ] 3 classes visibles
- [ ] 6 matières visibles
- [ ] 36 utilisateurs affichés
- [ ] CRUD fonctionnel pour tous les éléments
- [ ] Isolation multi-tenant vérifiée (voir uniquement données UNAL)

---

## ✅ CHECKLIST COMPLÈTE ÉTAPE 2

### Sorbonne
- [ ] Connexion réussie
- [ ] Dashboard visible
- [ ] 3 Départements listés et éditables
- [ ] 5 Niveaux listés, créables et supprimables
- [ ] 3 Classes listées et éditables
- [ ] 6 Matières listées et créables
- [ ] 36 Utilisateurs affichés
- [ ] Pas d'erreurs console

### UNAL Colombia
- [ ] Connexion réussie
- [ ] Dashboard visible
- [ ] 3 Départements corrects (Ing, Salud, Eco)
- [ ] 6 Niveaux (Semestres) listés
- [ ] 3 Classes correctes
- [ ] 6 Matières correctes
- [ ] 36 Utilisateurs affichés
- [ ] Isolation multi-tenant vérifiée
- [ ] Pas d'erreurs console

### Sécurité & Performance
- [ ] Les deux admins ne voient que leurs données
- [ ] Pas d'accès croisé entre universités
- [ ] Les pages chargent rapidement (<3s)
- [ ] Pas d'erreurs en console (F12)

---

## 📊 RAPPORT ÉTAPE 2

À la fin, créez un fichier `RAPPORT_ETAPE2.md` avec:

```markdown
# Rapport ÉTAPE 2 - Tests Administrateur

**Date**: [Date]
**Testeur**: [Nom]
**Statut**: ✅ RÉUSSI / ⚠️ PARTIEL / ❌ ÉCHOUÉ

## Sorbonne
- Connexion Admin: ✅
- Départements: ✅ (3/3)
- Niveaux: ✅ (5 listés, CRUD OK)
- Classes: ✅ (3/3, édition OK)
- Matières: ✅ (6/6, création OK)
- Utilisateurs: ✅ (36/36)
- Erreurs: Aucune

## UNAL Colombia
- Connexion Admin: ✅
- Départements: ✅ (3/3)
- Niveaux: ✅ (6/6)
- Classes: ✅ (3/3)
- Matières: ✅ (6/6)
- Utilisateurs: ✅ (36/36)
- Erreurs: Aucune

## Observations
- [Observations importantes]
- [Bugs trouvés]
- [Améliorations suggérées]

## Temps
- Début: [Heure]
- Fin: [Heure]
- Durée totale: [Durée]
```

---

## 🎯 PROCHAINE ÉTAPE

Une fois ÉTAPE 2 complétée et validée:

**ÉTAPE 3**: Tests Enseignant (2-3 heures)
- Connexion avec compte prof
- Voir ses classes
- Créer grades
- Gérer présences

Voir: GUIDE_EXECUTION_COMPLET.md → ÉTAPE 3

---

**Prêt? Commencez maintenant par la connexion Sorbonne!** 🚀

http://localhost:8080
