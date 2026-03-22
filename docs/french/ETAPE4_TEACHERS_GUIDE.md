# 🏫 ÉTAPE 4: Tests Enseignants (Rôle TEACHER)

**Durée estimée:** 2-3 heures  
**Objectif:** Tester l'accès des enseignants aux classes et gestion des notes/présences  
**Date:** 26 janvier 2026

---

## 📋 Résumé ÉTAPE 4

Les **Enseignants** (TEACHER) peuvent:
- ✅ Voir les classes auxquelles ils sont assignés
- ✅ Voir les étudiants de leurs classes
- ✅ Entrer/modifier les notes des étudiants
- ✅ Enregistrer l'attendance (présence/absence)
- ❌ Pas d'accès aux menu admin
- ❌ Pas d'accès aux classes d'autres enseignants
- ❌ Pas d'accès cross-université

---

## 👨‍🏫 Sorbonne: Enseignants à Tester

### Enseignant 1: Sciences
- **Email:** claude.renault@sorbonne.fr
- **Mot de passe:** Sorbonne@2025!
- **Département:** Sciences
- **Classe:** Licence 1 Sciences
- **Étudiants:** ~8 étudiants

### Enseignant 2: Lettres
- **Email:** marie.dupuis@sorbonne.fr
- **Mot de passe:** Sorbonne@2025!
- **Département:** Lettres
- **Classe:** Licence 1 Lettres
- **Étudiants:** ~8 étudiants

---

## 👨‍🏫 UNAL Colombia: Enseignants à Tester

### Enseignant 1: Ingeniería
- **Email:** diego.martinez@unal.edu.co
- **Mot de passe:** Colombia@2025!
- **Département:** Ingeniería
- **Classe:** Semestre 1 Ingeniería
- **Étudiants:** ~8 étudiants

### Enseignant 2: Medicina
- **Email:** ana.rodriguez@unal.edu.co
- **Mot de passe:** Colombia@2025!
- **Département:** Medicina
- **Classe:** Semestre 1 Medicina
- **Étudiants:** ~8 étudiants

---

## 🧪 ÉTAPE 4.1: Connexion Enseignant Sorbonne Sciences

### Procédure:
1. **Ouvrir:** http://localhost:3000
2. **Déconnecter** (si connecté)
3. **Nouvelle connexion:**
   - Email: `claude.renault@sorbonne.fr`
   - Mot de passe: `Sorbonne@2025!`

### Vérifications:
```
[ ] Connexion réussie
[ ] Dashboard "Enseignant" visible
[ ] En-tête: "Université de Paris Sorbonne"
[ ] Console clear (F12)
```

---

## 🧪 ÉTAPE 4.2: Vérifier les Restrictions d'Accès

### Menus Disponibles:

L'interface TEACHER doit afficher:
- ✅ Dashboard/Accueil
- ✅ Mes Classes (Classes assignées)
- ✅ Mes Étudiants (Étudiants de mes classes)
- ✅ Notes/Grades (Saisie des notes)
- ✅ Presence/Attendance (Enregistrement)
- ✅ Profil/Paramètres
- ❌ Admin (Menu global ABSENT)
- ❌ Directeur (ABSENT)
- ❌ Facultés (ABSENT)

```
[ ] Menu Classes limité à mes classes
[ ] Menu Notes/Grades visible
[ ] Menu Présences visible
[ ] Pas de menu admin global
```

---

## 🧪 ÉTAPE 4.3: Test "Mes Classes"

### Affichage des Classes:

**Cliquez sur "Mes Classes":**

Attendu:
```
Tableau affichant:
  - 1 classe assignée à cet enseignant
    Exemple: "Licence 1 Sciences"
    Département: Sciences
    Niveau: Licence 1
    Capacité: 30
    Nombre d'étudiants: ~8
```

Vérification:
```
[ ] 1 classe visible
[ ] Détails complets
[ ] Département correct
[ ] Nombre d'étudiants correct
```

### Voir Détails Classe:

**Cliquez sur la classe:**

Attendu:
```
Page détails:
  - Nom: Licence 1 Sciences
  - Code: L1-SCI
  - Directeur: [Nom directeur]
  - Liste des ~8 étudiants
  - Boutons: Voir notes, Enregistrer présence
```

Vérification:
```
[ ] Détails classe visibles
[ ] Liste étudiants complète (~8)
[ ] Boutons actions visibles
```

### Résultats Classes:
```
[ ] Mes Classes: 1 classe visible
[ ] Détails complets accessibles
[ ] Pas d'autres classes visibles
```

---

## 🧪 ÉTAPE 4.4: Test "Mes Étudiants"

### Affichage Étudiants:

**Cliquez sur "Mes Étudiants":**

Attendu:
```
Tableau affichant ~8 étudiants:
  - Alice Blanc (alice.blanc@student.sorbonne.fr)
  - Bob Durand (bob.durand@student.sorbonne.fr)
  - Cécile Emond (cecile.emond@student.sorbonne.fr)
  - David Fournier (david.fournier@student.sorbonne.fr)
  - [+ 4 autres]
  
Colonnes:
  - Nom
  - Email
  - Classe
  - Statut (Actif/Inactif)
```

Vérification:
```
[ ] ~8 étudiants affichés
[ ] Noms/emails corrects
[ ] Classe correcte pour chaque
[ ] Statut visible
```

### Voir Profil Étudiant:

**Cliquez sur un étudiant:**

Attendu:
```
Page profil:
  - Nom: Alice Blanc
  - Email: alice.blanc@student.sorbonne.fr
  - Classe: Licence 1 Sciences
  - Numéro Étudiant: [ID]
  - Date d'inscription: [DATE]
  - Statut: Actif
```

Vérification:
```
[ ] Profil complet visible
[ ] Classe assignée correcte
[ ] Pas d'édition du profil (lecture seule)
```

### Résultats Étudiants:
```
[ ] Liste ~8 étudiants visible
[ ] Profil étudiant accessible
[ ] Données correctes
```

---

## 🧪 ÉTAPE 4.5: Test Saisie des Notes (Grades)

### Accès au Formulaire Notes:

**Chemin:** Menu Notes/Grades OU Classe → Saisir notes

Attendu:
```
Formulaire affichant:
  - Classe: Licence 1 Sciences
  - Trimestre/Term: [TRIMESTRE COURANT]
  - Matière/Subject: [OPTIONNEL - si multiple matières]
  - Tableau des étudiants avec colonnes:
    - Nom étudiant
    - Email
    - Note (éditable)
    - Coefficient/Poids
```

Vérification:
```
[ ] Formulaire notes accessible
[ ] Étudiants listés (~8)
[ ] Champs notes éditables
```

### Saisir une Note:

**Action: Entrer une note pour Alice Blanc**

```
Champ "Note Alice": 15 (sur 20)
Coefficient: 1.0
Bouton: Enregistrer ou Sauvegarder
```

Résultat attendu:
```
✅ Note enregistrée
✅ Message confirmation
✅ Note apparaît dans la liste
❌ Erreur si note invalide (< 0 ou > 20)
```

Vérification:
```
[ ] Note saisie acceptée
[ ] Confirmation affichée
[ ] Note persistée (visible après rechargement)
[ ] Validation des données (0-20 ou 0-100)
```

### Éditer une Note:

**Action: Modifier la note d'Alice**

```
Note actuelle: 15
Nouvelle note: 17
Sauvegarder
```

Résultat attendu:
```
✅ Édition acceptée
✅ Note mise à jour
✅ Historique possible (voir ancien score?)
```

Vérification:
```
[ ] Édition possible
[ ] Note mise à jour
[ ] Pas de conflit avec autres données
```

### Saisir Plusieurs Notes:

**Action: Entrer notes pour 3-4 étudiants**

```
Alice: 15
Bob: 18
Cécile: 14
David: 16
Sauvegarder
```

Résultat attendu:
```
✅ Toutes les notes enregistrées
✅ Aucune perte de données
✅ Tableau mis à jour
```

Vérification:
```
[ ] Saisie batch possible
[ ] Toutes les notes sauvegardées
[ ] Pas d'erreurs
```

### Résultats Notes:
```
[ ] Accès formulaire notes OK
[ ] Saisie 1 note réussie
[ ] Édition note réussie
[ ] Saisie multiple réussie
[ ] Validation des données OK
```

---

## 🧪 ÉTAPE 4.6: Test Attendance (Présence)

### Accès Formulaire Présence:

**Chemin:** Menu Présences OU Classe → Enregistrer présence

Attendu:
```
Formulaire affichant:
  - Classe: Licence 1 Sciences
  - Date: [AUJOURD'HUI ou date sélectionnée]
  - Tableau des ~8 étudiants avec statuts:
    - Présent ✓
    - Absent ✗
    - Retard (LATE)
    - Excusé (EXCUSED)
    - Inconnu (UNKNOWN)
```

Vérification:
```
[ ] Formulaire présence accessible
[ ] ~8 étudiants listés
[ ] Boutons statuts visibles
[ ] Date date affichée
```

### Enregistrer Présence:

**Action: Marquer les étudiants présents/absents**

```
Alice:     ✓ Présent
Bob:       ✗ Absent
Cécile:    ✓ Présent
David:     (LATE) Retard
[+ autres] Présent
Sauvegarder
```

Résultat attendu:
```
✅ Présences enregistrées
✅ Message confirmation
✅ Données visibles après rechargement
```

Vérification:
```
[ ] Marquer présent fonctionne
[ ] Marquer absent fonctionne
[ ] Marquer retard fonctionne
[ ] Sauvegarder fonctionne
[ ] Pas de perte de données
```

### Éditer Présence:

**Action: Corriger un statut**

```
Alice: Présent → Absent (correction)
Sauvegarder
```

Résultat attendu:
```
✅ Correction acceptée
✅ Statut mis à jour
```

Vérification:
```
[ ] Édition présence possible
[ ] Changement persisté
```

### Présences Historiques:

**Action: Voir les présences de jours précédents**

```
Date: 25 janvier 2026 (jour précédent)
Attendu: Affichage des présences du jour précédent
```

Vérification:
```
[ ] Historique accessible (si implémenté)
[ ] Données anciennes visibles
```

### Résultats Présence:
```
[ ] Accès formulaire présence OK
[ ] Enregistrement présences OK
[ ] Édition présences OK
[ ] Persistance données OK
[ ] Historique visible (optionnel)
```

---

## 🧪 ÉTAPE 4.7: Test Isolation (Pas d'accès cross-classe)

### Vérification Sécurité:

**Essayez d'accéder à une classe d'un autre enseignant:**

```
URL directe: http://localhost:3000/class/[ID_AUTRE_CLASS]
Résultat attendu: 
  ✅ Accès refusé / Redirection
  ❌ Erreur 403 ou message "Non autorisé"
```

Vérification:
```
[ ] Pas d'accès à d'autres classes
[ ] Système de permission OK
```

---

## 🧪 ÉTAPE 4.8: Répéter pour Enseignant Lettres (Sorbonne)

**Même procédure 4.1-4.7:**

1. Connexion: `marie.dupuis@sorbonne.fr`
2. Vérifier: 1 classe Lettres
3. Vérifier: ~8 étudiants Lettres
4. Test notes et présences
5. Vérifier isolation

```
[ ] Connexion réussie
[ ] Classe Lettres visible
[ ] Étudiants Lettres visibles (~8)
[ ] Notes/Présences testées
[ ] Pas d'accès Sciences
```

---

## 🧪 ÉTAPE 4.9: Tests UNAL Colombia - Enseignant Ingeniería

**Même procédure complète:**

1. **Connexion:** `diego.martinez@unal.edu.co` / `Colombia@2025!`
2. **Classe:** Semestre 1 Ingeniería
3. **Étudiants:** ~8
4. **Tests:** Notes et présences
5. **Isolation:** UNAL uniquement

```
[ ] Connexion réussie
[ ] Classe Ingeniería visible
[ ] Étudiants visibles (~8)
[ ] Notes/Présences OK
[ ] Isolation multi-tenant OK
```

---

## 🧪 ÉTAPE 4.10: Tests UNAL Colombia - Enseignant Medicina

**Même procédure:**

1. **Connexion:** `ana.rodriguez@unal.edu.co`
2. **Classe:** Semestre 1 Medicina
3. **Tests:** Notes et présences

```
[ ] Connexion réussie
[ ] Classe Medicina visible
[ ] Étudiants visibles (~8)
[ ] Notes/Présences OK
```

---

## 📊 Checklist Complète ÉTAPE 4

### Sorbonne - Enseignant Sciences:
```
CONNEXION:
[ ] Connexion réussie
[ ] Dashboard enseignant visible
[ ] Console clear

CLASSES:
[ ] 1 classe Licence 1 Sciences
[ ] Détails complets
[ ] Étudiants listés (~8)

NOTES:
[ ] Accès formulaire notes
[ ] Saisie 1 note réussie
[ ] Édition note réussie
[ ] Saisie multiple OK

PRÉSENCES:
[ ] Accès formulaire présence
[ ] Enregistrement présences OK
[ ] Édition présences OK
[ ] Historique visible (optionnel)

SÉCURITÉ:
[ ] Pas d'accès autres classes
[ ] Isolation OK
```

### Sorbonne - Enseignant Lettres:
```
[ ] Connexion réussie
[ ] Classe Lettres visible
[ ] Étudiants visibles (~8)
[ ] Notes/Présences OK
[ ] Pas d'accès Sciences
```

### UNAL - Enseignant Ingeniería:
```
[ ] Connexion réussie
[ ] Classe Ingeniería visible
[ ] Étudiants visibles (~8)
[ ] Notes/Présences OK
[ ] Isolation UNAL OK
```

### UNAL - Enseignant Medicina:
```
[ ] Connexion réussie
[ ] Classe Medicina visible
[ ] Étudiants visibles (~8)
[ ] Notes/Présences OK
```

### Sécurité Globale:
```
[ ] Pas d'accès menu admin
[ ] Isolation cross-classe OK
[ ] Isolation cross-université OK
[ ] Pas de modification profils étudiants
```

---

## 📝 Rapport ÉTAPE 4

Créez un fichier `RAPPORT_ETAPE4.md`:

```markdown
# Rapport ÉTAPE 4: Tests Enseignants

## Résumé Exécutif
- Date: [DATE]
- Durée: [HEURES]
- Tests passés: [X/4] enseignants

## Résultats par Enseignant

### Sorbonne - Sciences (Claude Renault)
- Connexion: ✅ / ❌
- Classes visibles: ✅ / ❌
- Notes saisie: ✅ / ❌
- Présences enregistrement: ✅ / ❌
- Isolation OK: ✅ / ❌
- Erreurs: [NOTES]

### Sorbonne - Lettres (Marie Dupuis)
- [MÊME FORMAT]

### UNAL - Ingeniería (Diego Martinez)
- [MÊME FORMAT]

### UNAL - Medicina (Ana Rodriguez)
- [MÊME FORMAT]

## Bugs Trouvés
1. [DESCRIPTION]
   - Reproductibilité: [STEPS]
   - Impact: [SÉVÉRITÉ]

## Notes
[OBSERVATIONS]

## Prochaine Étape
ÉTAPE 5: Tests Étudiants (STUDENT)
```

---

## 🎯 Prochaine Étape

**ÉTAPE 5: Tests Étudiants (STUDENT)**
- Accès aux seules données personnelles
- Voir ses notes et présences
- Consulter son emploi du temps

---

**Estimé: 2-3 heures | Tester 4 enseignants | Rapporter bugs!** 🚀
