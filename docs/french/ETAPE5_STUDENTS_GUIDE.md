# 📚 ÉTAPE 5: Tests Étudiants (Rôle STUDENT)

**Durée estimée:** 2 heures  
**Objectif:** Tester l'accès des étudiants à leurs données personnelles  
**Date:** 26 janvier 2026

---

## 📋 Résumé ÉTAPE 5

Les **Étudiants** (STUDENT) peuvent accéder à:
- ✅ Leur profil personnel
- ✅ Leurs notes/grades
- ✅ Leurs présences/attendance
- ✅ Leur classe et camarades
- ✅ Leurs matières/cours
- ❌ Les notes d'autres étudiants
- ❌ Les données d'autres classes
- ❌ Aucun accès admin ou fonctions d'édition

---

## 👨‍🎓 Étudiants Sorbonne à Tester

### Étudiant 1: Sciences
- **Email:** alice.blanc@student.sorbonne.fr
- **Mot de passe:** Sorbonne@2025!
- **Classe:** Licence 1 Sciences
- **Département:** Sciences

### Étudiant 2: Lettres
- **Email:** bob.durand@student.sorbonne.fr
- **Mot de passe:** Sorbonne@2025!
- **Classe:** Licence 1 Lettres
- **Département:** Lettres

---

## 👨‍🎓 Étudiants UNAL à Tester

### Étudiant 1: Ingeniería
- **Email:** juan.cruz@student.unal.edu.co
- **Mot de passe:** Colombia@2025!
- **Classe:** Semestre 1 Ingeniería
- **Département:** Ingeniería

### Étudiant 2: Medicina
- **Email:** maria.reyes@student.unal.edu.co
- **Mot de passe:** Colombia@2025!
- **Classe:** Semestre 1 Medicina
- **Département:** Medicina

---

## 🧪 ÉTAPE 5.1: Connexion Étudiant Sorbonne Sciences

### Procédure:
1. **Ouvrir:** http://localhost:3000
2. **Déconnecter** (si connecté)
3. **Nouvelle connexion:**
   - Email: `alice.blanc@student.sorbonne.fr`
   - Mot de passe: `Sorbonne@2025!`

### Vérifications:
```
[ ] Connexion réussie
[ ] Dashboard étudiant visible
[ ] Prénom/Nom "Alice Blanc" affiché
[ ] En-tête: "Université de Paris Sorbonne"
[ ] Console clear (F12)
```

---

## 🧪 ÉTAPE 5.2: Vérifier l'Interface Étudiant

### Menus Disponibles:

L'interface STUDENT doit afficher:
- ✅ Dashboard/Accueil
- ✅ Mon Profil / Mes Infos
- ✅ Mes Notes / Grades
- ✅ Ma Présence / Attendance
- ✅ Ma Classe / Camarades
- ✅ Mes Matières / Cours
- ✅ Paramètres/Préférences
- ❌ Pas de menu admin
- ❌ Pas de menu enseignant
- ❌ Pas de menu directeur

```
[ ] Menu profil visible
[ ] Menu notes visible
[ ] Menu présence visible
[ ] Menu classe visible
[ ] Menu matières visible
[ ] Pas de menu admin/enseignant
```

---

## 🧪 ÉTAPE 5.3: Voir Profil Personnel

### Accès Profil:

**Cliquez sur "Mon Profil":**

Attendu:
```
Page profil affichant:
  - Nom: Alice Blanc
  - Email: alice.blanc@student.sorbonne.fr
  - Numéro Étudiant: [ID]
  - Date de Naissance: [DATE]
  - Classe: Licence 1 Sciences
  - Département: Sciences
  - Statut: Actif
  - Année Académique: 2025-2026
  - Téléphone (si disponible): [OPTIONAL]
  - Adresse (si disponible): [OPTIONAL]
```

Vérification:
```
[ ] Profil complet visible
[ ] Informations correctes
[ ] Classe assignée correcte
[ ] Statut actif
```

### Vérifier Restrictions:

**Essayez d'éditer le profil:**

Résultat attendu:
```
❌ Bouton édition absent
OU
✅ Bouton édition présent mais:
   - Seuls certains champs éditables
   - Exemple: Téléphone (oui), Email (non)
```

Vérification:
```
[ ] Profil en lecture seule (idéal)
[ ] OU Édition partielle avec restrictions
[ ] Impossible de modifier Classe/Département
```

### Résultats Profil:
```
[ ] Profil complet visible
[ ] Données correctes
[ ] Restrictions OK
```

---

## 🧪 ÉTAPE 5.4: Voir Ses Notes

### Accès Notes:

**Cliquez sur "Mes Notes" OU "Grades":**

Attendu:
```
Tableau affichant notes par matière:

Matière             | Note | Coefficient | Moyenne
──────────────────────────────────────────────────
Sciences (Matière 1) | 15   | 1.0        | 15/20
Anglais (Matière 2)  | 17   | 1.0        | 17/20
[+ autres matières]  | ...  | ...        | ...
──────────────────────────────────────────────────
Moyenne Générale:                          16/20
```

Vérifications:
```
[ ] Notes affichées
[ ] Matières listées
[ ] Coefficients visibles
[ ] Moyenne calculée
[ ] Seules ses notes visibles
```

### Détails Note:

**Cliquez sur une matière:**

Attendu:
```
Page détails affichant:
  - Matière: Sciences
  - Enseignant: Claude Renault
  - Classe: Licence 1 Sciences
  - Note: 15/20
  - Coefficient: 1.0
  - Date d'enregistrement: [DATE]
  - Commentaires de l'enseignant (optionnel)
```

Vérification:
```
[ ] Détails complets visibles
[ ] Note correcte
[ ] Enseignant affiché
[ ] Pas d'édition possible
```

### Vérifier Sécurité:

**Essayez de voir les notes d'un camarade:**

```
URL directe: http://localhost:3000/grades/[AUTRE_ETUDIANT_ID]
Résultat attendu:
  ✅ Accès refusé / Redirection
  ❌ Erreur 403 "Non autorisé"
```

Vérification:
```
[ ] Pas d'accès aux notes d'autres étudiants
```

### Résultats Notes:
```
[ ] Notes visibles et correctes
[ ] Détails accessibles
[ ] Pas d'édition
[ ] Sécurité OK (pas d'accès cross-étudiant)
```

---

## 🧪 ÉTAPE 5.5: Voir Ses Présences

### Accès Présences:

**Cliquez sur "Ma Présence" OU "Attendance":**

Attendu:
```
Tableau affichant historique présence:

Date         | Statut      | Remarques
─────────────────────────────────────────
26 Jan 2026  | Présent ✓   | -
25 Jan 2026  | Absent ✗    | -
24 Jan 2026  | Présent ✓   | -
23 Jan 2026  | Retard      | Absence justifiée
[+ autres dates]
─────────────────────────────────────────
Présent: 3/4 jours (75%)
Absent: 1/4 jours (25%)
```

Vérifications:
```
[ ] Historique présence visible
[ ] Dates affichées
[ ] Statuts corrects (Présent, Absent, Retard)
[ ] Statistiques calculées
```

### Détails Présence:

**Cliquez sur une date:**

Attendu:
```
Détails affichant:
  - Date: 26 janvier 2026
  - Cours: Sciences (Matière 1)
  - Heure: 09:00-11:00
  - Statut: Présent
  - Remarques: -
```

Vérification:
```
[ ] Détails complets visibles
[ ] Cours/Matière associée
[ ] Statut correct
[ ] Pas d'édition
```

### Résultats Présence:
```
[ ] Historique visible
[ ] Statuts corrects
[ ] Statistiques OK
[ ] Pas d'édition possible
```

---

## 🧪 ÉTAPE 5.6: Voir Sa Classe et Camarades

### Accès Classe:

**Cliquez sur "Ma Classe" OU "Camarades":**

Attendu:
```
Page classe affichant:
  - Nom: Licence 1 Sciences
  - Département: Sciences
  - Responsable: Claude Renault (directeur)
  - Lieu: Salle A101 (optionnel)
  - Capacité: 30
  - Étudiants inscrits: ~8

Liste des camarades:
  - Alice Blanc (vous) → Email masqué ou limité
  - [Autres étudiants de la classe]
  - Total: ~8 étudiants
```

Vérifications:
```
[ ] Classe visible
[ ] Détails complets
[ ] Liste camarades complète
[ ] Directeur visible
[ ] ~8 étudiants listés
```

### Cliquer sur un Camarade:

**Action: Voir profil d'un camarade**

Résultat attendu:
```
Affichage:
  ✅ Nom et prénom
  ✅ Email (optionnel)
  ❌ Pas de numéro téléphone
  ❌ Pas d'adresse personnelle
  ❌ Pas d'édition possible
```

Vérification:
```
[ ] Profil camarade visible
[ ] Informations limitées (privacy)
[ ] Pas d'accès à des données sensibles
```

### Résultats Classe:
```
[ ] Classe visible
[ ] Camarades listés (~8)
[ ] Profils camarades accessibles
[ ] Données sensibles protégées
```

---

## 🧪 ÉTAPE 5.7: Voir Ses Matières/Cours

### Accès Matières:

**Cliquez sur "Mes Matières" OU "Mes Cours":**

Attendu:
```
Liste des matières:
  - Sciences
    Enseignant: Claude Renault
    Coefficient: 1.0
    Note: 15/20
    Crédits: 3
    
  - Anglais
    Enseignant: Marie Dupuis
    Coefficient: 1.0
    Note: 17/20
    Crédits: 2
    
  [+ autres matières]
  
Total crédits: X
```

Vérifications:
```
[ ] Matières listées
[ ] Enseignants affichés
[ ] Notes visibles
[ ] Crédits calculés
```

### Détails Matière:

**Cliquez sur une matière:**

Attendu:
```
Détails affichant:
  - Nom: Sciences
  - Enseignant: Claude Renault
  - Classe: Licence 1 Sciences
  - Crédits: 3
  - Note: 15/20
  - Coefficient: 1.0
  - Description: [optionnel]
  - Matériel pédagogique: [liens optionnels]
```

Vérification:
```
[ ] Détails complets visibles
[ ] Enseignant correct
[ ] Note visible
[ ] Pas d'édition
```

### Résultats Matières:
```
[ ] Matières listées
[ ] Détails complets
[ ] Notes associées
```

---

## 🧪 ÉTAPE 5.8: Tester Restrictions d'Accès (Sécurité)

### Teste Accès Admin:

**Essayez d'accéder à:**
```
URL: http://localhost:3000/admin
Résultat: Redirection ou erreur 403
```

Vérification:
```
[ ] Pas d'accès menu admin
[ ] Redirection vers dashboard
```

### Test Accès Autres Étudiants:

**Essayez d'accéder au profil d'un autre étudiant:**
```
URL: http://localhost:3000/student/[AUTRE_ID]
Résultat: Erreur 403 ou redirection
```

Vérification:
```
[ ] Pas d'accès aux données d'autres étudiants
```

### Test Édition de Classe:

**Essayez de modifier votre classe:**
```
Attendu: Impossible
```

Vérification:
```
[ ] Pas d'édition classe possible
```

### Résultats Sécurité:
```
[ ] Pas d'accès menu admin
[ ] Pas d'accès cross-étudiant
[ ] Pas d'édition données
```

---

## 🧪 ÉTAPE 5.9: Répéter pour Étudiant Lettres (Sorbonne)

**Même procédure 5.1-5.8:**

1. **Connexion:** `bob.durand@student.sorbonne.fr`
2. **Classe:** Licence 1 Lettres (pas Sciences)
3. **Vérifier:** Notes, présences, camarades Lettres uniquement

```
[ ] Connexion réussie
[ ] Classe Lettres visible
[ ] Camarades Lettres visibles (~8)
[ ] Notes/Présences Lettres
[ ] Pas de données Sciences
```

---

## 🧪 ÉTAPE 5.10: Tests UNAL Colombia - Étudiant Ingeniería

**Même procédure complète:**

1. **Connexion:** `juan.cruz@student.unal.edu.co` / `Colombia@2025!`
2. **Classe:** Semestre 1 Ingeniería
3. **Tests:** Profil, notes, présences, camarades
4. **Isolation:** UNAL uniquement

```
[ ] Connexion réussie
[ ] Classe Ingeniería visible
[ ] Camarades visibles (~8)
[ ] Notes/Présences OK
[ ] Isolation multi-tenant OK
```

---

## 🧪 ÉTAPE 5.11: Tests UNAL Colombia - Étudiant Medicina

**Même procédure:**

1. **Connexion:** `maria.reyes@student.unal.edu.co`
2. **Classe:** Semestre 1 Medicina
3. **Tests:** Profil, notes, présences, camarades

```
[ ] Connexion réussie
[ ] Classe Medicina visible
[ ] Camarades visibles (~8)
[ ] Notes/Présences OK
```

---

## 📊 Checklist Complète ÉTAPE 5

### Sorbonne - Étudiant Sciences (Alice Blanc):
```
CONNEXION:
[ ] Connexion réussie
[ ] Dashboard étudiant visible
[ ] Prénom/Nom correct
[ ] Console clear

PROFIL:
[ ] Profil complet visible
[ ] Données correctes
[ ] Classe Sciences visible
[ ] Pas d'édition

NOTES:
[ ] Notes visibles
[ ] Matières listées
[ ] Moyenne calculée
[ ] Détails accessibles
[ ] Pas d'accès cross-étudiant

PRÉSENCE:
[ ] Historique visible
[ ] Statuts corrects
[ ] Statistiques calculées
[ ] Pas d'édition

CLASSE:
[ ] Classe Sciences visible
[ ] Camarades listés (~8)
[ ] Profils camarades accessibles
[ ] Données privées protégées

MATIÈRES:
[ ] Matières listées
[ ] Crédits calculés
[ ] Détails complets
[ ] Notes associées

SÉCURITÉ:
[ ] Pas d'accès admin
[ ] Pas d'accès autres étudiants
[ ] Pas d'édition données
```

### Sorbonne - Étudiant Lettres (Bob Durand):
```
[ ] Connexion réussie
[ ] Classe Lettres visible
[ ] Camarades Lettres visibles (~8)
[ ] Notes/Présences OK
[ ] Pas de données Sciences
```

### UNAL - Étudiant Ingeniería (Juan Cruz):
```
[ ] Connexion réussie
[ ] Classe Ingeniería visible
[ ] Camarades visibles (~8)
[ ] Notes/Présences OK
[ ] Isolation UNAL OK
```

### UNAL - Étudiant Medicina (Maria Reyes):
```
[ ] Connexion réussie
[ ] Classe Medicina visible
[ ] Camarades visibles (~8)
[ ] Notes/Présences OK
```

### Sécurité Globale:
```
[ ] Pas d'accès cross-rôle
[ ] Pas d'accès cross-université
[ ] Isolation données complète
[ ] Privacy OK
```

---

## 📝 Rapport ÉTAPE 5

Créez `RAPPORT_ETAPE5.md`:

```markdown
# Rapport ÉTAPE 5: Tests Étudiants

## Résumé Exécutif
- Date: [DATE]
- Durée: [HEURES]
- Tests passés: [X/4] étudiants

## Résultats par Étudiant

### Sorbonne - Sciences (Alice Blanc)
- Connexion: ✅ / ❌
- Profil visible: ✅ / ❌
- Notes visibles: ✅ / ❌
- Présences visibles: ✅ / ❌
- Classe/Camarades: ✅ / ❌
- Matières visibles: ✅ / ❌
- Sécurité OK: ✅ / ❌
- Erreurs: [NOTES]

### Sorbonne - Lettres (Bob Durand)
- [MÊME FORMAT]

### UNAL - Ingeniería (Juan Cruz)
- [MÊME FORMAT]

### UNAL - Medicina (Maria Reyes)
- [MÊME FORMAT]

## Bugs Trouvés
1. [DESCRIPTION]
   - Reproductibilité: [STEPS]
   - Impact: [SÉVÉRITÉ]

## Notes
[OBSERVATIONS]

## Prochaine Étape
ÉTAPE 6: Tests Parents et modules avancés
```

---

## 🎯 Prochaine Étape

**ÉTAPE 6: Tests Parents (PARENT)**
- Voir les notes de leurs enfants
- Accès limité aux informations
- Notifications des performances

---

**Estimé: 2 heures | Tester 4 étudiants | Rapporter bugs!** 🚀
