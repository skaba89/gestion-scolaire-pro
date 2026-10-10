# Cas réel — Université La Source (Conakry)

Document de mise en œuvre d'un établissement réel dans Academy Guinéenne, à
partir des informations **publiques** du site officiel
<https://www.universitelasource.com/> (pages Accueil, Qui sommes-nous,
Programmes, Inscription — consultées le **2026-10-09**).

Chaque donnée est étiquetée :

- **[RÉEL]** — reprise telle quelle du site officiel ;
- **[HYPOTHÈSE]** — proposition raisonnable (système LMD guinéen) **à faire
  confirmer par l'université** avant toute mise en production ;
- **[FICTIF]** — données de démonstration (étudiants, enseignants) : aucune
  personne réelle.

> Le site ne publie ni les frais, ni les durées, ni les effectifs, ni les
> maquettes de cours. Ces éléments sont listés en section 9 (« À obtenir de
> l'université »). Ne jamais saisir de montants inventés en production.

---

## 1. Fiche d'identité

| Champ ERP (`tenants`) | Valeur | Source |
|---|---|---|
| Nom | Université La Source | [RÉEL] (« Université La Source Conakry ») |
| Slug (URL) | `universite-la-source` | [HYPOTHÈSE] |
| Type | `university` | [RÉEL] — délivre Licence, Master, Ingénieur, Doctorat |
| Pays / ville | GN — Conakry (commune de Ratoma) | [RÉEL] |
| Téléphones | (+224) 612 61 26 27 · (+224) 660 50 18 85 (WhatsApp) | [RÉEL] |
| E-mails | info@universitelasource.com · service@universitelasource.com (inscriptions) | [RÉEL] |
| Site web | https://www.universitelasource.com/ | [RÉEL] |
| Création | 2003 | [RÉEL] |
| Fondateur | Président fondateur (nom public sur le site) | [RÉEL] |
| Accréditation | CAMES pour la Médecine et la Pharmacie | [RÉEL] |
| Devise / fuseau / langue | GNF · Africa/Conakry · fr | [HYPOTHÈSE] (Guinée) |

**Mission [RÉEL]** : « former des cadres de la République de Guinée et des
autres pays » — formation initiale et continue, recherche scientifique et
technologique, service à la communauté, valeurs culturelles africaines,
coopération internationale.

**Vision [RÉEL]** : « un phare d'excellence académique et d'innovation »,
formant « des leaders compétents, éthiques et engagés ».

**Valeurs [RÉEL]** : Excellence · Innovation · Éthique et intégrité ·
Engagement social · Inclusion et diversité · Esprit collaboratif.

> Page publique de l'établissement (module « Pages publiques ») : reprendre
> mission, vision, valeurs et contacts ci-dessus.

---

## 2. Campus

| Nom | Adresse | Principal | Source |
|---|---|---|---|
| Campus La Source | Ratoma, Conakry | oui | [RÉEL] (seul site mentionné) |

---

## 3. Facultés (`/faculties/`)

Le site présente six « départements » ; cinq sont des domaines d'études
(→ **facultés** dans l'ERP). Le sixième, « Master », est un **niveau de
diplôme**, pas une faculté : il est porté par les niveaux M1/M2 (section 6).

| Code | Nom | Source |
|---|---|---|
| ETAV | Études avancées | [RÉEL] |
| SEG | Sciences Économiques et Gestion | [RÉEL] |
| INTIC | Ingénierie & NTIC | [RÉEL] |
| SBM | Sciences Biomédicales | [RÉEL] |
| SPJS | Sciences Politiques, Juridiques et Sociales | [RÉEL] |

## 4. Départements (`/departments/`)

| Code | Département | Faculté | Source |
|---|---|---|---|
| ECO | Économie | SEG | [HYPOTHÈSE] (déduit de la Licence Économie) |
| BA | Banque et Assurance | SEG | [HYPOTHÈSE] (Licence Banque Assurance) |
| INFO | Informatique | INTIC | [HYPOTHÈSE] (Génie informatique, MIAGE) |
| MED | Médecine | SBM | [HYPOTHÈSE] (Doctorat Médecine) |
| PHA | Pharmacie | SBM | [HYPOTHÈSE] (Doctorat Pharmacie) |
| SP | Santé publique | ETAV | [HYPOTHÈSE] (Master Santé publique) |
| RI | Relations internationales | SPJS | [HYPOTHÈSE] |
| DRT | Droit | SPJS | [HYPOTHÈSE] (Master Droit) |

## 5. Programmes (`POST /infrastructure/programs/`)

Intitulés **[RÉEL]** (page Programmes). Diplôme [RÉEL] ; durée [HYPOTHÈSE].

| Code | Programme | Diplôme | Faculté | Durée | Niveaux |
|---|---|---|---|---|---|
| LIC-ECO | Économie | Licence | SEG | 3 ans | L1–L3 |
| LIC-BA | Banque Assurance | Licence | SEG | 3 ans | L1–L3 |
| LIC-RI | Relations Internationales | Licence | SPJS | 3 ans | L1–L3 |
| LP-MIAGE | MIAGE (Méthodes informatiques appliquées à la gestion des entreprises) | Licence professionnelle | INTIC | 3 ans | L1–L3 |
| ING-GI | Génie informatique | Diplôme d'ingénieur en informatique | INTIC | 5 ans | ING1–ING5 |
| M-SP | Santé publique (Épidémiologie de terrain – Santé communautaire) | Master | ETAV | 2 ans | M1–M2 |
| M-DRT | Droit | Master | SPJS | 2 ans | M1–M2 |
| DOC-MED | Médecine | Doctorat d'État | SBM | 7 ans | MED1–MED7 |
| DOC-PHA | Pharmacie | Doctorat d'État | SBM | 6 ans | PHA1–PHA6 |

> Écart ERP : le modèle `programs` n'a pas de lien vers un département ou une
> faculté. Indiquer la faculté dans la **description** du programme
> (ex. « Faculté SEG — Licence, 3 ans ») jusqu'à l'ajout de ce lien.

## 6. Niveaux (`/levels/`)

Le préréglage « université » crée déjà L1, L2, L3, M1, M2. Ajouter :

| Code | Nom | Ordre | Source |
|---|---|---|---|
| L1 / L2 / L3 | Licence 1 / 2 / 3 | 1–3 | préréglage ERP |
| M1 / M2 | Master 1 / 2 | 4–5 | préréglage ERP |
| ING1 … ING5 | Ingénieur 1 … 5 | 6–10 | [HYPOTHÈSE] |
| MED1 … MED7 | Médecine 1 … 7 | 11–17 | [HYPOTHÈSE] |
| PHA1 … PHA6 | Pharmacie 1 … 6 | 18–23 | [HYPOTHÈSE] |

## 7. Année académique et semestres

| Objet | Valeur | Source |
|---|---|---|
| Année académique | `2024-2025`, du 2024-10-01 au 2025-07-31, en cours | [HYPOTHÈSE] (inscriptions Licence ouvertes du **1er juin 2024 au 5 février 2025** [RÉEL]) |
| Semestre 1 | 2024-10-01 → 2025-02-15 | [HYPOTHÈSE] |
| Semestre 2 | 2025-02-16 → 2025-07-31 | [HYPOTHÈSE] |
| Crédits pour passer à l'année suivante | 60 ECTS par an (30 par semestre) | [HYPOTHÈSE] (LMD) |

## 8. Classes (`POST /infrastructure/classrooms/`)

Une classe = programme × niveau × année, rattachée au campus. Exemple pour
2024-2025 (capacités [HYPOTHÈSE]) :

| Classe | Programme | Niveau | Capacité |
|---|---|---|---|
| L1 Économie | LIC-ECO | L1 | 60 |
| L1 Banque Assurance | LIC-BA | L1 | 40 |
| L1 Relations Internationales | LIC-RI | L1 | 40 |
| L1 MIAGE | LP-MIAGE | L1 | 35 |
| ING1 Génie informatique | ING-GI | ING1 | 35 |
| M1 Santé publique | M-SP | M1 | 30 |
| M1 Droit | M-DRT | M1 | 30 |
| MED1 Médecine | DOC-MED | MED1 | 80 |
| PHA1 Pharmacie | DOC-PHA | PHA1 | 50 |

## 9. Matières — exemple de maquette du semestre 1 (`/subjects/`)

**[HYPOTHÈSE] — à remplacer par la maquette officielle de l'université.**
Champs ERP : code, nom, coefficient, ECTS, heures CM / TD / TP, semestre.

| Programme | Code | Matière | ECTS | CM | TD | TP |
|---|---|---|---|---|---|---|
| L1 Économie | ECO101 | Microéconomie I | 6 | 30 | 20 | 0 |
| L1 Économie | ECO102 | Macroéconomie I | 6 | 30 | 20 | 0 |
| L1 Économie | ECO103 | Mathématiques pour l'économie | 6 | 24 | 24 | 0 |
| L1 Économie | ECO104 | Comptabilité générale | 6 | 24 | 24 | 0 |
| L1 Économie | ECO105 | Statistique descriptive | 3 | 15 | 15 | 0 |
| L1 Économie | ECO106 | Expression écrite et orale | 3 | 15 | 15 | 0 |
| ING1 Génie informatique | GI101 | Algorithmique et programmation | 6 | 24 | 12 | 24 |
| ING1 Génie informatique | GI102 | Architecture des ordinateurs | 6 | 24 | 12 | 12 |
| ING1 Génie informatique | GI103 | Mathématiques discrètes | 6 | 24 | 24 | 0 |
| ING1 Génie informatique | GI104 | Systèmes d'exploitation | 6 | 24 | 12 | 24 |
| ING1 Génie informatique | GI105 | Anglais technique | 3 | 0 | 30 | 0 |
| ING1 Génie informatique | GI106 | Techniques d'expression | 3 | 15 | 15 | 0 |
| MED1 Médecine | MED101 | Anatomie générale | 8 | 40 | 0 | 20 |
| MED1 Médecine | MED102 | Biologie cellulaire | 6 | 30 | 0 | 15 |
| MED1 Médecine | MED103 | Biochimie | 6 | 30 | 10 | 10 |
| MED1 Médecine | MED104 | Biophysique | 5 | 25 | 10 | 10 |
| MED1 Médecine | MED105 | Santé publique et éthique médicale | 5 | 25 | 10 | 0 |

## 10. Admissions et inscriptions (module Admissions)

**Processus [RÉEL]** — 6 étapes : ouverture des inscriptions → demande en
ligne → examen du dossier → validation de la demande → paiement des frais en
ligne → validation finale (traitement annoncé : 24 h).

**Pièces exigées [RÉEL]** (nouveaux inscrits) :

1. extrait d'acte de naissance ou copie légalisée ;
2. attestation de réussite au Baccalauréat ou équivalent ;
3. relevé de notes du Baccalauréat ;
4. photo d'identité.

En cours de cycle : les mêmes pièces, plus les relevés de notes des années
précédentes. Prérequis : Baccalauréat [RÉEL] (série non précisée).

→ Configurer ces quatre pièces comme documents obligatoires du formulaire de
candidature, et le statut de candidature selon les 6 étapes.

## 11. Frais (`POST /payments/fees/`) — **montants à obtenir**

Le site n'indique **aucun montant**. Structure proposée [HYPOTHÈSE] — les
montants restent à `0` / non saisis tant que l'université ne les a pas
communiqués :

| Frais | Portée | Échéancier |
|---|---|---|
| Frais d'inscription | tous programmes, annuel | à l'inscription |
| Scolarité Licence (Éco, BA, RI, MIAGE) | par an | 3 tranches (oct., janv., avr.) |
| Scolarité Ingénieur (Génie informatique) | par an | 3 tranches |
| Scolarité Master | par an | 3 tranches |
| Scolarité Médecine / Pharmacie | par an | 3 tranches |

Paiement : « paiement des frais en ligne » [RÉEL] → Mobile Money (Orange
Money, MTN MoMo) via le module Paiements de l'ERP. Pas de carte bancaire.

## 12. Ordre de mise en œuvre

| # | Étape | Où (interface) | API |
|---|---|---|---|
| 1 | Créer l'établissement + son administrateur | SUPER_ADMIN › Nouvel établissement | `POST /tenants/create-with-admin/` |
| 2 | L'admin définit son mot de passe (lien e-mail), termine l'assistant d'installation | e-mail + `/{slug}/admin/onboarding` | — |
| 3 | Paramètres (devise GNF, fuseau, logo, contacts) | Admin › Paramètres | `PATCH /tenants/{id}/` |
| 4 | Campus | Admin › Campus | `/campuses/` |
| 5 | Année académique + semestres | Admin › Années / Semestres | `/academic-years/`, `/semesters/` |
| 6 | Facultés puis départements | Admin › Facultés / Départements | `/faculties/`, `/departments/` |
| 7 | Programmes | Admin › Programmes | `/infrastructure/programs/` |
| 8 | Niveaux (ajouts ING, MED, PHA) | Admin › Niveaux | `/levels/` |
| 9 | Classes | Admin › Classes | `/infrastructure/classrooms/` |
| 10 | Matières (maquette officielle) | Admin › Matières | `/subjects/` |
| 11 | Frais (montants officiels) | Admin › Finances | `/payments/fees/` |
| 12 | Enseignants | Admin › Import de données | import CSV `enseignants.csv` |
| 13 | Étudiants | Admin › Import de données | import CSV `etudiants.csv` |
| 14 | Page publique | Admin › Pages publiques | `/public-pages/` |

Faire d'abord la saisie sur un établissement **de test** (slug
`universite-la-source-demo`), valider avec l'université, puis créer
l'établissement définitif.

## 13. Données de démonstration [FICTIF]

- [`etudiants.csv`](etudiants.csv) — 12 étudiants fictifs répartis sur
  5 classes (colonnes reconnues par l'import : nom, prénom, date de
  naissance `AAAA-MM-JJ`, sexe, matricule, niveau, classe, année, e-mail,
  téléphone, ville, parent / tuteur).
- [`enseignants.csv`](enseignants.csv) — 6 enseignants fictifs (nom, prénom,
  e-mail, téléphone, matières, diplôme, département, type de contrat).

Les noms sont fictifs, les e-mails utilisent le domaine réservé
`example.test` et les téléphones sont des numéros de test : **ne pas
importer ces fichiers dans l'établissement définitif.**

## 14. À obtenir de l'université avant la production

1. Organigramme : recteur / directeur général, doyens, chefs de département
   (pour `dean_id` / `head_id`).
2. Durée officielle de chaque programme et intitulés exacts des niveaux
   (Médecine : 6 ou 7 ans ? Pharmacie : 5 ou 6 ?).
3. Maquettes officielles : matières, ECTS, coefficients, volumes CM/TD/TP par
   semestre.
4. Calendrier académique 2025-2026 (dates des semestres, examens, sessions de
   rattrapage).
5. Grille des frais (inscription, scolarité par programme, échéancier) et
   comptes Mobile Money de l'université.
6. Effectifs par classe et listes officielles (étudiants, enseignants) au
   format CSV, avec l'accord de l'université (données personnelles).
7. Règles de passage (crédits, compensation, rattrapage) et barème de notation.
8. Partenariats internationaux mentionnés (« institutions prestigieuses ») :
   noms exacts si l'université souhaite les afficher.
