# 📊 ÉTAPE 7-8: Tests Modules Avancés (Grades + Attendance)

**Durée estimée:** 3-4 heures  
**Objectif:** Tester les modules avancés (Grades, Attendance, Communications)  
**Date:** 26 janvier 2026

---

## 📋 Résumé ÉTAPE 7-8

### Modules à Tester

**ÉTAPE 7: Module Grades (Notes)**
- ✅ Saisie des notes par enseignant
- ✅ Calcul automatique des moyennes
- ✅ Historique des notes
- ✅ Pondération des coefficients
- ✅ Rapports de performances

**ÉTAPE 8: Module Attendance (Présences)**
- ✅ Enregistrement présences/absences
- ✅ Justification absences
- ✅ Statistiques par étudiant
- ✅ Alertes absences récurrentes
- ✅ Rapports d'assiduité

---

## 🧪 ÉTAPE 7: Module Grades (Notes)

### 7.1: Saisie de Notes - Professeur Sciences (Sorbonne)

**Connexion:** claude.renault@sorbonne.fr / Sorbonne@2025!

**Action:**
```
Menu: Grades / Notes / Mes Classes
Classe: Licence 1 Sciences
Matière: Sciences (ou première matière)
Terme: Janvier 2026 (ou courant)
```

**Tâche: Saisir notes pour ~8 étudiants**
```
Alice Blanc:    15/20
Bob Durand:     18/20
Cécile Emond:   14/20
David Fournier: 16/20
Emma Gérard:    17/20
Frank Garnier:  19/20
Grace Gilles:   13/20
Henri Gaston:   15/20
```

**Vérifications:**
```
[ ] Accès formulaire notes
[ ] ~8 étudiants listés
[ ] Champs notes éditables
[ ] Validation 0-20 ou 0-100
[ ] Sauvegarde sans erreur
[ ] Notes persistées (rechargement)
```

**Résultats:**
```
✅ Toutes les notes saisies
✅ Sauvegarde confirmée
✅ Pas de perte de données
✅ Persistance vérifiée
```

---

### 7.2: Vérification Moyennes Calculées

**Action: Admin se connecte et vérifie les moyennes**

**Connexion:** admin@sorbonne.fr / Sorbonne@2025!

**Navigation:** Grades → Rapports → Classe: L1 Sciences

**Attendu:**
```
Tableau moyennes:

Étudiant        | Note | Moyenne | Rang
─────────────────────────────────────────
Alice Blanc     | 15   | 15.0    | 4/8
Bob Durand      | 18   | 18.0    | 1/8
Cécile Emond    | 14   | 14.0    | 6/8
David Fournier  | 16   | 16.0    | 3/8
Emma Gérard     | 17   | 17.0    | 2/8
Frank Garnier   | 19   | 19.0    | 1/8 (meilleur)
Grace Gilles    | 13   | 13.0    | 8/8
Henri Gaston    | 15   | 15.0    | 4/8
─────────────────────────────────────────
Moyenne classe: 15.875
Meilleure note: 19 (Frank)
Pire note: 13 (Grace)
Écart-type: 1.95
```

**Vérifications:**
```
[ ] Moyennes calculées correctement
[ ] Classement correct
[ ] Écart-type/Statistiques visibles
[ ] Pas d'erreurs de calcul
[ ] Historique accessible
```

**Résultats:**
```
✅ Moyennes calculées OK
✅ Statistiques correctes
✅ Aucune erreur numérique
```

---

### 7.3: Édition et Correction de Notes

**Action: Corriger une note incorrecte**

**Professeur se reconnecte et édite:**
```
Note actuelle Alice: 15
Correction: 16 (amélioration)
Sauvegarder
```

**Vérifications:**
```
[ ] Édition possible
[ ] Moyenne mise à jour
[ ] Historique enregistré (ancien score visible?)
[ ] Pas de conflit
```

**Résultats:**
```
✅ Édition réussie
✅ Nouvelle moyenne: 16.0
✅ Mise à jour instantanée
```

---

### 7.4: Rapport de Performance (Admin)

**Connexion Admin: admin@sorbonne.fr**

**Navigation:** Rapports → Performances → Classe

**Attendu:**
```
Analyse par classe:
  - Classe: Licence 1 Sciences
  - Nombre d'étudiants: 8
  - Taux de succès: 87.5% (7/8 ≥ 10)
  - Moyenne générale: 15.875
  - Écart-type: 1.95
  - Distribution notes:
    - Excellent (18-20): 2 étudiants
    - Bon (15-17): 4 étudiants
    - Acceptable (12-14): 2 étudiants
    - Insuffisant (<12): 0 étudiants
```

**Graphiques attendus:**
```
[ ] Courbe de distribution
[ ] Histogramme notes
[ ] Évolution moyenne (si plusieurs périodes)
```

**Vérifications:**
```
[ ] Rapport généré
[ ] Statistiques correctes
[ ] Graphiques affichés
[ ] Export possible (PDF?)
```

**Résultats:**
```
✅ Rapport généré OK
✅ Statistiques fiables
✅ Visualisations correctes
```

---

### 7.5: Répéter pour Autres Enseignants

**Même procédure:**
- Enseignant 2 Sorbonne (marie.dupuis@sorbonne.fr)
- Enseignants UNAL (diego.martinez@, ana.rodriguez@)

```
[ ] ÉTAPE 7.1-4 pour Marie Dupuis (Lettres)
[ ] ÉTAPE 7.1-4 pour Diego Martinez (Ingeniería)
[ ] ÉTAPE 7.1-4 pour Ana Rodriguez (Medicina)
```

---

## 🧪 ÉTAPE 8: Module Attendance (Présences)

### 8.1: Enregistrement de Présences

**Connexion Enseignant:** claude.renault@sorbonne.fr

**Navigation:** Attendance / Présences / Mes Classes

**Saisir présences pour 2024-01-26:**
```
Classe: Licence 1 Sciences
Date: 26 janvier 2026
Cours: Sciences (9h-11h)

Statut:
  Alice Blanc:     PRESENT ✓
  Bob Durand:      PRESENT ✓
  Cécile Emond:    ABSENT ✗
  David Fournier:  LATE (Retard)
  Emma Gérard:     PRESENT ✓
  Frank Garnier:   PRESENT ✓
  Grace Gilles:    EXCUSED (Excusé)
  Henri Gaston:    PRESENT ✓
```

**Sauvegarder**

**Vérifications:**
```
[ ] Formulaire accessible
[ ] Champs éditables
[ ] Tous les statuts disponibles
[ ] Sauvegarde sans erreur
[ ] Données persistées
```

**Résultats:**
```
✅ Présences enregistrées (8/8)
✅ Mix: 5 présents, 1 absent, 1 retard, 1 excusé
✅ Sauvegarde confirmée
```

---

### 8.2: Enregistrement Avec Justifications

**Même enseignant - jour suivant (27 janvier):**

**Saisir avec commentaires:**
```
Date: 27 janvier 2026

Alice Blanc:     ABSENT (raison: malade)
Cécile Emond:    ABSENT (raison: excusée - événement famille)
David Fournier:  LATE (retard 15 min)
Grace Gilles:    PRESENT ✓
[...autres présents]
```

**Vérifications:**
```
[ ] Champ "Raison" pour absents
[ ] Champ "Justification" optionnel
[ ] Texte libre sauvegardé
[ ] Pas de limite caractères excessive
```

**Résultats:**
```
✅ Présences avec justifications enregistrées
✅ Commentaires sauvegardés
```

---

### 8.3: Édition de Présences

**Correction d'une erreur:**

```
David Fournier: LATE → PRESENT (correction)
Raison: Erreur entrée, était présent à l'heure
Sauvegarder
```

**Vérifications:**
```
[ ] Édition possible
[ ] Statut changé
[ ] Justification effacée/mise à jour
[ ] Pas de conflit
```

**Résultats:**
```
✅ Édition réussie
✅ Statut mis à jour
```

---

### 8.4: Statistiques de Présence (Vue Enseignant)

**Enseignant voit:**

**Navigation:** Attendance → Statistiques ou Analytics

**Attendu:**
```
Par classe (Licence 1 Sciences):

Taux de présence global: 85% (multiple jours)
Jours couverts: 2 (26-27 janvier)

Étudiant        | Jours    | Présent | Absent | Retard | Taux
─────────────────────────────────────────────────────────────
Alice Blanc     | 2 jours  | 1       | 1      | 0      | 50%
Bob Durand      | 2 jours  | 2       | 0      | 0      | 100%
Cécile Emond    | 2 jours  | 0       | 2      | 0      | 0%
David Fournier  | 2 jours  | 1       | 0      | 1      | 50%
Emma Gérard     | 2 jours  | 2       | 0      | 0      | 100%
Frank Garnier   | 2 jours  | 2       | 0      | 0      | 100%
Grace Gilles    | 2 jours  | 1       | 0      | 0      | 50% (excusé)
Henri Gaston    | 2 jours  | 2       | 0      | 0      | 100%
─────────────────────────────────────────────────────────────
Absences à risque: Cécile Emond (0%)
Retards: David Fournier (1)
```

**Vérifications:**
```
[ ] Statistiques calculées
[ ] Pourcentages corrects
[ ] Alertes pour absences élevées
[ ] Tri par performance possible
```

**Résultats:**
```
✅ Statistiques générées
✅ Calculs corrects
✅ Alertes visibles
```

---

### 8.5: Rapport d'Assiduité (Admin)

**Admin:** admin@sorbonne.fr

**Navigation:** Rapports → Assiduité / Attendance

**Attendu:**
```
Analyse d'assiduité:

Par classe (Licence 1 Sciences):
  - Taux moyen: 85%
  - Meilleur étudiant: Bob/Emma/Frank (100%)
  - Étudiant à risque: Cécile (0%)
  
Tendances:
  - Absences en hausse?
  - Retards constants?
  - Justifications appropriées?

Alertes:
  - CRITIQUE: Cécile 0% présence
  - ATTENTION: Alice/David/Grace 50%
```

**Actions possibles:**
```
[ ] Exporter rapport en PDF
[ ] Envoyer alertes aux parents
[ ] Exporter pour dossier étudiant
```

**Vérifications:**
```
[ ] Rapport généré
[ ] Alertes pertinentes
[ ] Export fonctionne
```

**Résultats:**
```
✅ Rapport généré
✅ Alertes activées
✅ Export OK
```

---

### 8.6: Notification d'Absence (Automatique?)

**Vérifier si notifications envoyées:**

**Attendu:**
```
Pour parent Anne Blanc (Alice):
  - Email reçu: "Votre enfant Alice a une absence"
  - Date: 26 janvier 2026
  - Raison: [si fournie]
  - Action: Voir détails/Justifier

Vérifications:
  [ ] Email reçu (vérifier MailHog: http://localhost:8026)
  [ ] Contenu correct
  [ ] Lien fonctionnel
```

**Résultats:**
```
✅ Notification envoyée (ou fonctionnalité absent)
✅ Contenu correct
```

---

### 8.7: Répéter pour Autres Enseignants

**Même procédure 8.1-6:**
- Marie Dupuis (Lettres Sorbonne)
- Diego Martinez (Ingeniería UNAL)
- Ana Rodriguez (Medicina UNAL)

```
[ ] ÉTAPE 8.1-6 pour Marie Dupuis
[ ] ÉTAPE 8.1-6 pour Diego Martinez
[ ] ÉTAPE 8.1-6 pour Ana Rodriguez
```

---

## 📊 Checklist ÉTAPE 7-8

```
ÉTAPE 7: GRADES (Notes)
[ ] Saisie notes Enseignant 1 (Claude) OK
[ ] Moyennes calculées correctement
[ ] Édition notes fonctionne
[ ] Rapport performances généré
[ ] Statistiques correctes
[ ] Répété pour 3 autres enseignants

ÉTAPE 8: ATTENDANCE (Présences)
[ ] Enregistrement présences OK
[ ] Justifications sauvegardées
[ ] Édition fonctionne
[ ] Statistiques calculées
[ ] Rapport assiduité généré
[ ] Notifications envoyées (optionnel)
[ ] Répété pour 3 autres enseignants

INTÉGRATION:
[ ] Notes et présences liées (absence impacte moyenne?)
[ ] Rapports croisés disponibles
[ ] Pas de conflit de données
```

---

## 📝 Rapport ÉTAPE 7-8

```markdown
# Rapport ÉTAPE 7-8: Tests Modules Avancés

## Résumé
- Durée: [HEURES]
- Notes saisies: [X] entrées
- Présences enregistrées: [X] jours
- Succès: [%]

## ÉTAPE 7: Grades
- Saisie notes: ✅/❌
- Calcul moyennes: ✅/❌
- Édition: ✅/❌
- Rapports: ✅/❌
- Erreurs: [NOTES]

## ÉTAPE 8: Attendance
- Enregistrement: ✅/❌
- Justifications: ✅/❌
- Statistiques: ✅/❌
- Notifications: ✅/❌
- Erreurs: [NOTES]

## Bugs
[LISTE]

## Notes
[OBSERVATIONS]
```

---

**Estimé: 3-4 heures | Tests complets modules | Rapporter bugs!** 🚀
