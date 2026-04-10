# 👨‍👩‍👧 ÉTAPE 6: Tests Parents (Rôle PARENT)

**Durée estimée:** 1-2 heures  
**Objectif:** Tester l'accès des parents aux données de leurs enfants  
**Date:** 26 janvier 2026

---

## 📋 Résumé ÉTAPE 6

Les **Parents** (PARENT) peuvent:
- ✅ Voir les notes de leurs enfants
- ✅ Voir les présences de leurs enfants
- ✅ Voir le profil de leurs enfants
- ✅ Voir les contacts des enseignants
- ❌ Pas d'édition de données
- ❌ Accès limité aux données de l'enfant uniquement
- ❌ Pas d'accès à d'autres familles

---

## 👨‍👩‍👧 Parents à Tester

### Sorbonne

**Parent 1: Anne Blanc (mère d'Alice)**
- Email: anne.blanc@parent.sorbonne.fr
- Mot de passe: Sorbonne@2025!
- Enfant: Alice Blanc (Sciences)
- Accès: Notes et présences Alice

**Parent 2: Louis Durand (père de Bob)**
- Email: louis.durand@parent.sorbonne.fr
- Mot de passe: Sorbonne@2025!
- Enfant: Bob Durand (Lettres)
- Accès: Notes et présences Bob

### UNAL Colombia

**Parent 1: Maria Cruz (mère de Juan)**
- Email: maria.cruz@parent.unal.edu.co
- Mot de passe: Colombia@2025!
- Enfant: Juan Cruz (Ingeniería)
- Accès: Notes et présences Juan

**Parent 2: Gabriel Reyes (père de Maria)**
- Email: gabriel.reyes@parent.unal.edu.co
- Mot de passe: Colombia@2025!
- Enfant: Maria Reyes (Medicina)
- Accès: Notes et présences Maria

---

## 🧪 ÉTAPE 6.1: Connexion Parent

### Procédure:
1. **Ouvrir:** http://localhost:3000
2. **Déconnecter** (si connecté)
3. **Nouvelle connexion:**
   - Email: `anne.blanc@parent.sorbonne.fr`
   - Mot de passe: `Sorbonne@2025!`

### Vérifications:
```
[ ] Connexion réussie
[ ] Dashboard parent visible
[ ] Nom parent affiché
[ ] Enfant(s) listé(s)
[ ] Console clear (F12)
```

---

## 🧪 ÉTAPE 6.2: Voir Enfant(s) et Informations

### Affichage Enfants:

**Page d'accueil parent:**

Attendu:
```
Liste des enfants:
  - Alice Blanc
    Classe: Licence 1 Sciences
    Département: Sciences
    Université: Sorbonne
    Statut: Actif
```

Vérification:
```
[ ] Enfant(s) affiché(s)
[ ] Classe correcte
[ ] Département correct
[ ] Statut visible
```

### Profil Enfant:

**Cliquez sur l'enfant:**

Attendu:
```
Informations affichées:
  - Nom: Alice Blanc
  - Email: alice.blanc@student.sorbonne.fr
  - Numéro Étudiant: [ID]
  - Classe: Licence 1 Sciences
  - Département: Sciences
  - Enseignant responsable: Claude Renault
  - Contacts enseignants: Visibles?
```

Vérification:
```
[ ] Profil enfant visible
[ ] Données correctes
[ ] Contacts enseignants affichés
[ ] Pas d'édition possible
```

### Résultats Enfant:
```
[ ] Enfant(s) listés
[ ] Profil accessible
[ ] Données correctes
```

---

## 🧪 ÉTAPE 6.3: Voir Notes de l'Enfant

### Accès Notes:

**Cliquez sur "Notes" ou équivalent:**

Attendu:
```
Tableau des notes d'Alice:

Matière             | Note | Moyenne
──────────────────────────────────────
Sciences            | 15   | 15/20
Anglais             | 17   | 17/20
[+ autres matières] | ...  | ...
──────────────────────────────────────
Moyenne Générale:               16/20
Tendance: En progrès ↗
```

Vérifications:
```
[ ] Notes visibles
[ ] Matières listées
[ ] Moyenne calculée
[ ] Tendance affichée (optionnel)
[ ] Historique visible (si plusieurs périodes)
```

### Détails Note:

**Cliquez sur une matière:**

Attendu:
```
Détails affichant:
  - Matière: Sciences
  - Note: 15/20
  - Coefficient: 1.0
  - Enseignant: Claude Renault
  - Email enseignant: [optionnel]
  - Classe: Licence 1 Sciences
  - Commentaire enseignant: [optionnel]
```

Vérification:
```
[ ] Détails complets
[ ] Enseignant visible avec contact
[ ] Pas d'édition possible
```

### Résultats Notes:
```
[ ] Notes visibles
[ ] Matières listées
[ ] Moyenne calculée
[ ] Détails accessibles
[ ] Pas d'édition
```

---

## 🧪 ÉTAPE 6.4: Voir Présences de l'Enfant

### Accès Présences:

**Cliquez sur "Présences" ou "Attendance":**

Attendu:
```
Historique présence d'Alice:

Date         | Cours                | Statut     | Taux
─────────────────────────────────────────────────────────
26 Jan 2026  | Sciences (09h-11h)  | Présent ✓  | 100%
25 Jan 2026  | Sciences (09h-11h)  | Absent ✗   | 75%
24 Jan 2026  | Sciences (09h-11h)  | Présent ✓  | 75%
[+ dates]    | [cours]             | [statut]   | [taux]
─────────────────────────────────────────────────────────
Taux présence: 75% (3/4 jours)
Alertes: Absent 1 jour
```

Vérifications:
```
[ ] Historique visible
[ ] Dates affichées
[ ] Statuts corrects
[ ] Taux calculé
[ ] Alertes si absences
```

### Tendance Présence:

**Vérifier si tendance affichée:**

Attendu:
```
- Taux de présence en baisse?
- Alertes pour absences répétées?
- Contacts pour signaler absence?
```

Vérification:
```
[ ] Tendance visible
[ ] Alertes affichées
[ ] Contacts enseignant disponibles
```

### Résultats Présence:
```
[ ] Historique visible
[ ] Statuts corrects
[ ] Taux calculé
[ ] Tendance visible (optionnel)
```

---

## 🧪 ÉTAPE 6.5: Accès Contacts Enseignants

### Voir Contacts:

**Chercher section "Contacts" ou "Équipe pédagogique":**

Attendu:
```
Liste des enseignants d'Alice:

Enseignant          | Matière    | Email                    | Téléphone
─────────────────────────────────────────────────────────────────────────
Claude Renault      | Sciences   | claude.renault@sorb.fr   | [optionnel]
Marie Dupuis        | Anglais    | marie.dupuis@sorb.fr     | [optionnel]
[+ autres]          | [...]      | [...]                    | [...]
─────────────────────────────────────────────────────────────────────────
Directeur: [Nom]
Email directeur: [email]
```

Vérifications:
```
[ ] Contacts visibles
[ ] Emails affichés
[ ] Matières associées
[ ] Directeur listé
[ ] Pas de modification
```

### Résultats Contacts:
```
[ ] Liste enseignants visible
[ ] Emails accessibles
[ ] Directeur affiché
```

---

## 🧪 ÉTAPE 6.6: Vérifier Restrictions

### Test Accès Autres Enfants:

**Essayez d'accéder aux notes d'un enfant d'un autre parent:**

```
URL: http://localhost:3000/child/[AUTRE_ENFANT_ID]
Résultat: Erreur 403 ou redirection
```

Vérification:
```
[ ] Pas d'accès enfants d'autres parents
```

### Test Accès Admin:

**Essayez d'accéder à l'admin:**
```
URL: http://localhost:3000/admin
Résultat: Redirection ou erreur 403
```

Vérification:
```
[ ] Pas d'accès menu admin
```

### Test Édition:

**Essayez d'éditer notes ou présences:**
```
Résultat: Pas de bouton édition
```

Vérification:
```
[ ] Pas d'édition possible
[ ] Données en lecture seule
```

### Résultats Sécurité:
```
[ ] Pas d'accès cross-enfant
[ ] Pas d'accès admin
[ ] Pas d'édition données
```

---

## 🧪 ÉTAPE 6.7: Répéter pour Autres Parents

**Même procédure pour:**
1. Louis Durand (parent Bob - Lettres Sorbonne)
2. Maria Cruz (parent Juan - Ingeniería UNAL)
3. Gabriel Reyes (parent Maria - Medicina UNAL)

```
[ ] Connexion réussie
[ ] Enfant correct affiché
[ ] Notes visibles
[ ] Présences visibles
[ ] Pas d'accès cross-enfant
```

---

## 📊 Checklist ÉTAPE 6

```
PARENT ANNE BLANC (Alice Sciences):
[ ] Connexion réussie
[ ] Enfant Alice affiché
[ ] Profil enfant visible
[ ] Notes Alice visibles
[ ] Présences Alice visibles
[ ] Contacts enseignants visibles
[ ] Pas d'édition

PARENT LOUIS DURAND (Bob Lettres):
[ ] Connexion réussie
[ ] Enfant Bob affiché
[ ] Notes Bob visibles
[ ] Présences Bob visibles
[ ] Isolation OK (pas Alice)

PARENT MARIA CRUZ (Juan Ingeniería UNAL):
[ ] Connexion réussie
[ ] Enfant Juan affiché
[ ] Notes Juan visibles
[ ] Présences Juan visibles
[ ] Isolation UNAL OK

PARENT GABRIEL REYES (Maria Medicina UNAL):
[ ] Connexion réussie
[ ] Enfant Maria affiché
[ ] Notes Maria visibles
[ ] Présences Maria visibles

SÉCURITÉ:
[ ] Pas d'accès cross-enfant
[ ] Pas d'accès admin
[ ] Pas d'édition
```

---

## 📝 Rapport ÉTAPE 6

```markdown
# Rapport ÉTAPE 6: Tests Parents

## Résumé
- Durée: [HEURES]
- Parents testés: [X/4]
- Succès: [X/4]

## Résultats

### Anne Blanc (Alice)
- Connexion: ✅/❌
- Enfant visible: ✅/❌
- Notes visibles: ✅/❌
- Présences visibles: ✅/❌
- Contacts OK: ✅/❌
- Sécurité OK: ✅/❌

[MÊME FORMAT POUR AUTRES]

## Bugs
[LISTE]

## Notes
[OBSERVATIONS]
```

---

**Estimé: 1-2 heures | Tester 4 parents | Rapporter bugs!** 🚀
