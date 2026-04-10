# 📘 Guide de Paramétrage Multi-Établissements : Cas Réels

Ce guide vous accompagne dans la configuration de **SchoolFlow Pro** pour différents types d'établissements. Que vous gériez une université, un lycée ou une école primaire, ce document fournit les structures et données types pour une mise en service rapide.

---

## 📑 Sommaire
1. [Introduction](#1-introduction)
2. [Roadmap de Configuration](#2-roadmap-de-configuration)
3. [Cas 1 : L'Université (Système LMD)](#cas-1--luniversité-système-lmd)
4. [Cas 2 : Le Lycée (Secondaire)](#cas-2--le-lycée-secondaire)
5. [Cas 3 : L'École Primaire](#cas-3--lécole-primaire)
6. [Cas 4 : Centre de Formation](#cas-4--centre-de-formation)
7. [Validation & Isolation](#7-validation--isolation)

---

## 1. Introduction
SchoolFlow Pro est conçu pour être **flexible**. Chaque "Tenant" (établissement) possède sa propre isolation. Un administrateur d'université ne verra jamais les données d'une école primaire, même s'ils partagent la même plateforme technique.

---

## 2. Roadmap de Configuration
Pour chaque nouvel établissement, suivez toujours cet ordre logique :

1.  **Paramètres Système** : Définir la devise (GNF, XOF, EUR), le fuseau horaire et le type d'établissement.
2.  **Année Académique** : Créer l'année en cours (ex: 2024-2025) et définir les périodes (Semestres ou Trimestres).
3.  **Campus** : Créer au moins un site physique.
4.  **Niveaux (Levels)** : Définir la hiérarchie (L1, 10ème, CP1, etc.).
5.  **Départements** : Créer les facultés, filières ou séries.
6.  **Matières** : Créer le catalogue de cours et les lier aux niveaux.
7.  **Classes** : Créer les groupes d'élèves en liant Niveau + Campus.

---

## Cas 1 : L'Université (Système LMD)
*Idéal pour : Universités publiques/privées, Grandes Écoles.*

### 🛠 Configuration Spécifique
- **Type :** `UNIVERSITY`
- **Périodes :** Semestres (S1, S2)
- **Calcul :** Crédits ECTS et Moyennes pondérées.

### 📊 Données Types
| Niveau | Département | Matières (Exemples) | Coeff / Crédits |
| :--- | :--- | :--- | :--- |
| **Licence 1** | Informatique | Algorithmique 1, Mathématiques | 4 Coeff / 6 ECTS |
| **Licence 3** | Génie Logiciel | Développement Web, Base de Données | 5 Coeff / 6 ECTS |
| **Master 2** | Cybersécurité | Cryptographie, Sécurité Cloud | 6 Coeff / 10 ECTS |

---

## Cas 2 : Le Lycée (Secondaire)
*Idéal pour : Collèges et Lycées d'enseignement général.*

### 🛠 Configuration Spécifique
- **Type :** `SCHOOL`
- **Périodes :** Trimestres (T1, T2, T3)
- **Calcul :** Coefficients par série (Département).

### 📊 Données Types
| Niveau | Série (Département) | Matières (Exemples) | Coefficients |
| :--- | :--- | :--- | :--- |
| **Terminale** | Sc. Mathématiques | Mathématiques, Physique | 5 (Math), 4 (Phys) |
| **Terminale** | Sc. Sociales | Philosophie, Histoire/Géo | 4 (Philo), 3 (Hist) |
| **10ème** | Tronc Commun | Français, Calcul, Anglais | 4 (Fr), 4 (Calc) |

---

## Cas 3 : L'École Primaire
*Idéal pour : Maternelle et Élémentaire.*

### 🛠 Configuration Spécifique
- **Type :** `SCHOOL`
- **Focus :** Suivi simplifié, livrets de compétences, présence quotidienne.

### 📊 Données Types
| Niveau | Département | Matières (Exemples) | Coeff |
| :--- | :--- | :--- | :--- |
| **CP1 / CP2** | Primaire | Reading, Writing, Math | 5 |
| **CM1 / CM2** | Primaire | French, Mathématiques, Awakening | 5 (Fr/Math), 2 (Eveil) |

---

## Cas 4 : Centre de Formation
*Idéal pour : Centres pros, Instituts de langue, Formation courte.*

### 🛠 Configuration Spécifique
- **Type :** `TRAINING_CENTER`
- **Périodes :** Sessions (Janvier-Mars, etc.) ou Modules.

### 📊 Données Types
| Niveau / Certif | Filière | Module (Matière) | Durée / Coeff |
| :--- | :--- | :--- | :--- |
| **Niveau 1** | Infographie | Adobe Photoshop Fondamentaux | 40h / Coeff 1 |
| **Certifié** | Marketing | Stratégie Réseaux Sociaux | 20h / Coeff 1 |

---

## 7. Validation & Isolation
Une fois vos données saisies, effectuez ces vérifications :

1.  **Vérification de l'étanchéité** : Connectez-vous avec l'admin du Lycée. Vérifiez qu'il ne voit pas la liste des étudiants de l'Université.
2.  **Vérification des coefficients** : Créez une évaluation. Vérifiez que la moyenne calculée par le système respecte bien les coefficients saisis dans l'étape "Matières".
3.  **Vérification Campus** : Assurez-vous que les classes sont bien réparties sur les bons sites géographiques.

---
> [!TIP]
> **Astuce de saisie :** Utilisez les "Codes" courts (ex: `INFO-L1`) pour vos départements. Cela facilite les recherches et l'affichage sur mobile.
