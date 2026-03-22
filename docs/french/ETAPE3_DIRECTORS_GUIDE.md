# 🎓 ÉTAPE 3: Tests Directeurs (Rôle DIRECTOR)

**Durée estimée:** 2-3 heures  
**Objectif:** Tester l'accès limité des directeurs par département  
**Date:** 26 janvier 2026

---

## 📋 Résumé ÉTAPE 3

Les **Directeurs** (DIRECTOR) ont un accès limité:
- ✅ Voir uniquement les données de leur département
- ✅ Gestion des classes dans leur département
- ✅ Accès aux utilisateurs de leur département
- ❌ Pas d'accès aux autres départements
- ❌ Pas d'accès aux menus administrateur globaux

---

## 🏛️ Sorbonne: Directeurs à Tester

### Directeur 1: Sciences
- **Email:** directeur.sciences@sorbonne.fr
- **Mot de passe:** Sorbonne@2025!
- **Département:** Sciences
- **Accès:** Classes et utilisateurs Sciences uniquement

### Directeur 2: Lettres
- **Email:** directeur.lettres@sorbonne.fr
- **Mot de passe:** Sorbonne@2025!
- **Département:** Lettres
- **Accès:** Classes et utilisateurs Lettres uniquement

---

## 🏛️ UNAL Colombia: Directeurs à Tester

### Directeur 1: Ingeniería
- **Email:** director.ingenieria@unal.edu.co
- **Mot de passe:** Colombia@2025!
- **Département:** Ingeniería
- **Accès:** Classes et utilisateurs Ingeniería uniquement

### Directeur 2: Medicina/Salud
- **Email:** director.medicina@unal.edu.co
- **Mot de passe:** Colombia@2025!
- **Département:** Medicina (Salud)
- **Accès:** Classes et utilisateurs Medicina uniquement

---

## 🧪 ÉTAPE 3.1: Connexion Directeur Sorbonne Sciences

### Procédure:
1. **Ouvrir:** http://localhost:3000
2. **Déconnecter l'admin** (si connecté)
   - Menu utilisateur → Déconnexion
3. **Nouvelle connexion:**
   - Email: `directeur.sciences@sorbonne.fr`
   - Mot de passe: `Sorbonne@2025!`

### Vérifications:
- ✅ Connexion réussie
- ✅ Dashboard "Directeur Sciences" visible
- ✅ En-tête: "Université de Paris Sorbonne"
- ✅ Pas d'erreurs console (F12)

### Résultats:
```
[ ] Connexion OK
[ ] Dashboard visible
[ ] Titre université correct
[ ] Console clear (F12)
```

---

## 🧪 ÉTAPE 3.2: Vérifier les Restrictions d'Accès

### A. Menu Disponible:
L'interface DIRECTEUR doit afficher:
- ✅ Dashboard/Accueil
- ✅ Classes (Sciences uniquement)
- ✅ Utilisateurs (Sciences uniquement)
- ✅ Profil/Paramètres
- ❌ Admin (Menu global ABSENT)
- ❌ Facultés (ABSENT)
- ❌ Niveaux (ABSENT)
- ❌ Matières (ABSENT)

### B. Test Isolation Départementale:

**Cliquez sur "Classes":**

Attendu:
- Affichage: Classes associées au département Sciences
- Si 1 classe: "Licence 1 Sciences"
- Pas d'autres classes

Vérification:
```
[ ] Classes Sciences affichées
[ ] Nombre: 1 classe (ou selon structure)
[ ] Pas d'autres départements visibles
```

**Cliquez sur "Utilisateurs":**

Attendu:
- Affichage: Utilisateurs du département Sciences
  - 1 Directeur (vous-même)
  - 1 Professeur
  - ~8 Étudiants
  - Total ~10 utilisateurs

Vérification:
```
[ ] Utilisateurs Sciences visibles
[ ] Directeur visible
[ ] Professeurs Sciences visibles
[ ] Étudiants Sciences visibles
[ ] Pas d'utilisateurs d'autres depts
```

### Résultats Isolation:
```
[ ] Menus limités au rôle DIRECTOR
[ ] Classes Sciences uniquement
[ ] Utilisateurs Sciences uniquement
[ ] Pas d'accès admin global
```

---

## 🧪 ÉTAPE 3.3: Test CRUD Classes (Sciences)

### Lecture (Read):

**Voir les classes Sciences:**
```
Action: Cliquez sur "Classes" (ou équivalent)
Attendu: Affichage de ~1 classe
Élément: "Licence 1 Sciences" (ou similaire)
  - Code: L1-SCI (ou similaire)
  - Niveau: Licence 1
  - Capacité: 30 (ou nombre initial)
  - Professeur assigné: Affiché?
```

Vérification:
```
[ ] Classes Sciences affichées
[ ] 1 classe visible
[ ] Détails complets visibles
```

### Édition (Update):

**Modifier la capacité:**
```
Action: Cliquez sur la classe → Éditer
Champ: Capacité
Valeur actuelle: 30 (exemple)
Nouvelle valeur: 35
Bouton: Sauvegarder
```

Résultat attendu:
- ✅ Modification acceptée
- ✅ Message de confirmation
- ✅ Capacité mise à jour dans la liste

Vérification:
```
[ ] Formulaire édition ouvert
[ ] Champ capacité modifiable
[ ] Sauvegarde fonctionne
[ ] Données mises à jour immédiatement
[ ] Pas d'erreurs console
```

### Création (Create):

⚠️ **Vérifier les permissions:**
```
Action: Chercher un bouton "+ Nouvelle classe"
Résultat attendu:
  ✅ Bouton visible (création autorisée pour DIRECTOR)
  OU
  ❌ Bouton absent (DIRECTOR ne peut pas créer)
```

Si création possible:
```
Action: Cliquez sur "+ Nouvelle classe"
Remplissez:
  - Nom: "Licence 2 Sciences"
  - Niveau: Licence 2
  - Capacité: 25
  - Sauvegardez
```

Résultat attendu:
- ✅ Nouvelle classe créée
- ✅ Apparaît dans la liste
- ✅ Assignée au département Sciences

Vérification:
```
[ ] Bouton création visible (ou absent selon design)
[ ] Si visible: création fonctionne
[ ] Nouvelle classe dans la liste
[ ] Département automatiquement assigné
```

### Suppression (Delete):

⚠️ **Tester avec prudence - peut être restreinte:**

```
Action: Sur une classe non critique → Supprimer
Résultat attendu:
  ✅ Suppression possible (avec confirmation)
  OU
  ❌ Bouton suppression absent (sécurité)
```

Vérification:
```
[ ] Bouton supprimer visible (ou absent)
[ ] Si visible: confirmation demandée
[ ] Si supprimée: classe enlevée de la liste
```

### Résultats CRUD Classes:
```
[ ] READ: Classes Sciences visibles
[ ] UPDATE: Capacité modifiée
[ ] CREATE: Nouvelle classe créée (si autorisé)
[ ] DELETE: Classe supprimée (si autorisé)
```

---

## 🧪 ÉTAPE 3.4: Test Utilisateurs Sciences

### Affichage des Utilisateurs:

**Cliquez sur "Utilisateurs":**

Attendu:
```
Tableau affichant:
  - 1 Directeur (vous)
    Email: directeur.sciences@sorbonne.fr
    Rôle: DIRECTOR
    
  - 1 Professeur Sciences
    Email: claude.renault@sorbonne.fr (ou autre)
    Rôle: TEACHER
    
  - ~8 Étudiants Sciences
    Emails: alice.blanc@student.sorbonne.fr (etc.)
    Rôle: STUDENT
    
Total: ~10 utilisateurs (Sciences uniquement)
```

Vérification:
```
[ ] Liste utilisateurs affichée
[ ] 10 utilisateurs visibles (Sciences)
[ ] Pas d'autres départements
[ ] Rôles corrects affichés
```

### Voir Détails Utilisateur:

**Cliquez sur un étudiant:**

Attendu:
```
Page détails affichant:
  - Nom: Alice Blanc
  - Email: alice.blanc@student.sorbonne.fr
  - Rôle: STUDENT
  - Département: Sciences
  - Classe: Licence 1 Sciences
  - Statut: Actif/Inactif
```

Vérification:
```
[ ] Détails complets visibles
[ ] Département correct (Sciences)
[ ] Classe assignée visible
```

### Résultats Utilisateurs:
```
[ ] Liste utilisateurs Sciences complète
[ ] ~10 utilisateurs affichés
[ ] Détails utilisateur accessibles
[ ] Pas de données d'autres départements
```

---

## 🧪 ÉTAPE 3.5: Répéter pour Directeur Lettres (Sorbonne)

**Même procédure que 3.1-3.4:**

1. **Déconnecter Sciences**
2. **Connecter Lettres:** `directeur.lettres@sorbonne.fr`
3. **Vérifier isolation:** Classes Lettres uniquement
4. **Tester CRUD:** Créer/Éditer classe Lettres
5. **Vérifier utilisateurs:** ~10 utilisateurs Lettres

### Checklist Lettres:
```
[ ] Connexion réussie
[ ] Classes Lettres visibles (~1)
[ ] Utilisateurs Lettres visibles (~10)
[ ] CRUD Classes fonctionne
[ ] Pas de données Sciences visibles
```

---

## 🧪 ÉTAPE 3.6: Tests UNAL Colombia - Directeur Ingeniería

**Même procédure complète:**

1. **URL:** http://localhost:3000
2. **Connexion:** `director.ingenieria@unal.edu.co` / `Colombia@2025!`
3. **Vérifications:**
   - Dashboard UNAL visible
   - Classes Ingeniería uniquement (~1)
   - Utilisateurs Ingeniería (~10)
   - CRUD fonctionne
4. **Isolation:** Pas de données autres départements

### Checklist Ingeniería:
```
[ ] Connexion réussie
[ ] Dashboard UNAL visible
[ ] Classes Ingeniería visibles
[ ] Utilisateurs Ingeniería (~10)
[ ] CRUD Classes OK
[ ] Isolation multi-tenant OK
```

---

## 🧪 ÉTAPE 3.7: Tests UNAL Colombia - Directeur Medicina

**Même procédure:**

1. **Connexion:** `director.medicina@unal.edu.co` / `Colombia@2025!`
2. **Vérifications:** Medicina uniquement
3. **Isolation:** OK

### Checklist Medicina:
```
[ ] Connexion réussie
[ ] Classes Medicina visibles
[ ] Utilisateurs Medicina (~10)
[ ] CRUD Classes OK
```

---

## 🔐 Vérifications de Sécurité

### Test Isolation Multi-Tenant:

**Après test Sorbonne:**
1. Connectez-vous UNAL
2. Vérifiez que vous ne voyez PAS les données Sorbonne
3. Les universités sont complètement isolées

```
[ ] Sorbonne: Données Sorbonne uniquement
[ ] UNAL: Données UNAL uniquement
[ ] Pas de mélange entre universités
```

### Test Accès Non-Autorisé:

**Essayez d'accéder manuellement (avancé):**
```
URL: http://localhost:3000/admin
Résultat: Redirection vers dashboard ou accès refusé
```

---

## 📊 Checklist Complète ÉTAPE 3

### Sorbonne - Directeur Sciences:
```
CONNEXION:
[ ] Connexion réussie
[ ] Dashboard visible
[ ] Titre "Sorbonne" correct
[ ] Console clear

MENUS:
[ ] Menu Classes visible
[ ] Menu Utilisateurs visible
[ ] Menu Admin ABSENT
[ ] Menu Facultés ABSENT

ISOLATION:
[ ] Classes Sciences uniquement (~1)
[ ] Utilisateurs Sciences uniquement (~10)
[ ] Pas de données autres depts

CRUD CLASSES:
[ ] Lecture: Classes visibles
[ ] Édition: Capacité modifiée
[ ] Création: Nouvelle classe créée (si autorisé)
[ ] Suppression: Classe supprimée (si autorisé)

UTILISATEURS:
[ ] Liste complète visible (~10)
[ ] Détails utilisateur accessible
[ ] Rôles corrects affichés
```

### Sorbonne - Directeur Lettres:
```
[ ] Connexion réussie
[ ] Classes Lettres visibles (~1)
[ ] Utilisateurs Lettres visibles (~10)
[ ] CRUD Classes fonctionne
[ ] Pas de données Sciences
```

### UNAL - Directeur Ingeniería:
```
[ ] Connexion réussie
[ ] Dashboard UNAL visible
[ ] Classes Ingeniería visibles (~1)
[ ] Utilisateurs Ingeniería visibles (~10)
[ ] CRUD Classes fonctionne
[ ] Isolation UNAL OK
```

### UNAL - Directeur Medicina:
```
[ ] Connexion réussie
[ ] Classes Medicina visibles (~1)
[ ] Utilisateurs Medicina visibles (~10)
[ ] CRUD Classes fonctionne
[ ] Isolation tenant OK
```

### Sécurité Globale:
```
[ ] Accès admin refusé aux directeurs
[ ] Isolation multi-université OK
[ ] Pas d'accès cross-tenant
```

---

## 📝 Rapport ÉTAPE 3

Créez un fichier `RAPPORT_ETAPE3.md` avec:

```markdown
# Rapport ÉTAPE 3: Tests Directeurs

## Résumé Exécutif
- Date: [DATE]
- Durée: [HEURES]
- Tests passés: [X/4] directeurs

## Résultats par Directeur

### Sorbonne - Sciences
- Connexion: ✅ / ❌
- Classes visibles: ✅ / ❌
- CRUD fonctionne: ✅ / ❌
- Isolation OK: ✅ / ❌
- Erreurs: [NOTES]

### Sorbonne - Lettres
- Connexion: ✅ / ❌
- Classes visibles: ✅ / ❌
- CRUD fonctionne: ✅ / ❌
- Isolation OK: ✅ / ❌
- Erreurs: [NOTES]

### UNAL - Ingeniería
- Connexion: ✅ / ❌
- Classes visibles: ✅ / ❌
- CRUD fonctionne: ✅ / ❌
- Isolation OK: ✅ / ❌
- Erreurs: [NOTES]

### UNAL - Medicina
- Connexion: ✅ / ❌
- Classes visibles: ✅ / ❌
- CRUD fonctionne: ✅ / ❌
- Isolation OK: ✅ / ❌
- Erreurs: [NOTES]

## Bugs Trouvés
1. [DESCRIPTION BUG]
   - Reproductibilité: [STEPS]
   - Impact: [SÉVÉRITÉ]

## Notes et Observations
[REMARQUES LIBRES]

## Prochaine Étape
ÉTAPE 4: Tests Enseignants (TEACHER)
```

---

## 🎯 Prochaine Étape

**ÉTAPE 4: Tests Enseignants (TEACHER)**
- Accès limité aux classes assignées
- Gestion des notes et présences
- Accès restreint aux données élèves

---

## 📚 Documents de Référence

- [TEST_CREDENTIALS_72_USERS.md](TEST_CREDENTIALS_72_USERS.md) - Tous les identifiants
- [GUIDE_EXECUTION_COMPLET.md](GUIDE_EXECUTION_COMPLET.md) - Plan global
- Console navigateur (F12) pour déboguer

---

**Estimé: 2-3 heures | Tester les 4 directeurs | Rapporter les bugs!** 🚀
