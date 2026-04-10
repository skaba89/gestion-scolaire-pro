# 📋 Plan de Test Complet - SchoolFlow Pro
## 2 Universités Distinctes + Version Mobile Multiplateforme

**Date de Création**: 26 Janvier 2026  
**Statut**: Production Ready  
**Durée Estimée**: 3-4 jours de test complet  
**Environnement**: Docker local + Capacitor (iOS/Android)

---

## 📊 Vue d'Ensemble du Plan

### Objectifs Principaux
1. ✅ **Valider 2 universités complètement indépendantes** avec données réalistes
2. ✅ **Tester toutes les fonctionnalités** (admin, professeurs, étudiants, parents)
3. ✅ **Vérifier l'isolation des données** entre les universités
4. ✅ **Construire et tester versions mobiles** (iOS + Android)
5. ✅ **Valider les performances** et la réactivité
6. ✅ **Documenter les résultats** pour chaque scénario

### Deux Universités de Test
```
UNIVERSITÉ 1: Université de Paris Sorbonne
  - Type: Grande université (2000+ étudiants)
  - Facultés: Sciences, Lettres, Droit
  - Pays: France
  - Devise: EUR

UNIVERSITÉ 2: Universidad Nacional de Colombia
  - Type: Université nationale (1500+ étudiants)
  - Facultés: Ingénierie, Santé, Économie
  - Pays: Colombie
  - Devise: COP
```

---

## 🗄️ PHASE 1: PRÉPARATION DES DONNÉES (1-2 heures)

### 1.1 Créer les Universités

**SQL: Créer la première université**
```sql
INSERT INTO public.tenants (
  name, 
  slug, 
  logo_url, 
  address, 
  phone, 
  email, 
  website, 
  type, 
  is_active,
  settings
) VALUES (
  'Université de Paris Sorbonne',
  'sorbonne-paris',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Seal_of_Universit%C3%A9_de_Paris.svg/220px-Seal_of_Universit%C3%A9_de_Paris.svg.png',
  '47 Rue des Écoles, 75005 Paris, France',
  '+33 1 42 86 82 00',
  'contact@sorbonne.fr',
  'www.sorbonne-universite.fr',
  'UNIVERSITY',
  true,
  '{
    "country": "France",
    "currency": "EUR",
    "timezone": "Europe/Paris",
    "language": "fr",
    "academic_year_start": "2025-09-01",
    "academic_year_end": "2026-08-31",
    "semester_1_start": "2025-09-01",
    "semester_1_end": "2025-12-20",
    "semester_2_start": "2026-01-12",
    "semester_2_end": "2026-06-30"
  }'
);

-- Récupérer l'ID
SELECT id FROM public.tenants WHERE slug = 'sorbonne-paris';
```

**SQL: Créer la deuxième université**
```sql
INSERT INTO public.tenants (
  name, 
  slug, 
  logo_url, 
  address, 
  phone, 
  email, 
  website, 
  type, 
  is_active,
  settings
) VALUES (
  'Universidad Nacional de Colombia',
  'unal-colombia',
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Logo_escudo_de_la_Universidad_Nacional_de_Colombia.svg/220px-Logo_escudo_de_la_Universidad_Nacional_de_Colombia.svg.png',
  'Carrera 45 No. 26-85, Bogotá, Colombia',
  '+57 1 316 5000',
  'contact@unal.edu.co',
  'www.unal.edu.co',
  'UNIVERSITY',
  true,
  '{
    "country": "Colombia",
    "currency": "COP",
    "timezone": "America/Bogota",
    "language": "es",
    "academic_year_start": "2025-01-20",
    "academic_year_end": "2025-12-15",
    "semester_1_start": "2025-01-20",
    "semester_1_end": "2025-06-15",
    "semester_2_start": "2025-08-04",
    "semester_2_end": "2025-12-15"
  }'
);

SELECT id FROM public.tenants WHERE slug = 'unal-colombia';
```

### 1.2 Créer Comptes Administrateurs

**Pour Université 1 (Sorbonne)**
```sql
-- Créer compte admin
INSERT INTO auth.users (
  email,
  encrypted_password,
  email_confirmed_at,
  created_at
) VALUES (
  'admin@sorbonne.fr',
  crypt('Sorbonne@2025!', gen_salt('bf')),
  NOW(),
  NOW()
) RETURNING id;

-- Utiliser l'ID retourné ci-dessous
INSERT INTO public.profiles (
  id,
  tenant_id,
  email,
  first_name,
  last_name,
  is_active,
  created_at
) VALUES (
  '<USER_ID_FROM_ABOVE>',
  '<TENANT_ID_SORBONNE>',
  'admin@sorbonne.fr',
  'Jean',
  'Dupont',
  true,
  NOW()
);

-- Assigner le rôle TENANT_ADMIN
INSERT INTO public.user_roles (
  user_id,
  tenant_id,
  role
) VALUES (
  '<USER_ID_FROM_ABOVE>',
  '<TENANT_ID_SORBONNE>',
  'TENANT_ADMIN'
);
```

**Pour Université 2 (Colombia)**
```sql
-- Créer compte admin
INSERT INTO auth.users (
  email,
  encrypted_password,
  email_confirmed_at,
  created_at
) VALUES (
  'admin@unal.edu.co',
  crypt('Colombia@2025!', gen_salt('bf')),
  NOW(),
  NOW()
) RETURNING id;

INSERT INTO public.profiles (
  id,
  tenant_id,
  email,
  first_name,
  last_name,
  is_active,
  created_at
) VALUES (
  '<USER_ID_FROM_ABOVE>',
  '<TENANT_ID_COLOMBIA>',
  'admin@unal.edu.co',
  'María',
  'González',
  true,
  NOW()
);

INSERT INTO public.user_roles (
  user_id,
  tenant_id,
  role
) VALUES (
  '<USER_ID_FROM_ABOVE>',
  '<TENANT_ID_COLOMBIA>',
  'TENANT_ADMIN'
);
```

---

## 👥 PHASE 2: CRÉER LES UTILISATEURS TEST (45 min - 1 heure)

### 2.1 Données Utilisateurs Sorbonne (Paris)

**Administrateurs/Directeurs (3 personnes)**
```
1. Jean Dupont (admin) - jean.dupont@sorbonne.fr
2. Sophie Martin (directrice) - sophie.martin@sorbonne.fr
3. Pierre Leclerc (coordonnateur) - pierre.leclerc@sorbonne.fr
```

**Professeurs (5 personnes)**
```
1. Prof. Claude Renault (Mathématiques) - claude.renault@sorbonne.fr
2. Prof. Isabelle Bernard (Littérature) - isabelle.bernard@sorbonne.fr
3. Prof. Michel Petit (Droit) - michel.petit@sorbonne.fr
4. Prof. Véronique Rousseau (Chimie) - veronique.rousseau@sorbonne.fr
5. Prof. Laurent Moreau (Économie) - laurent.moreau@sorbonne.fr
```

**Étudiants (20 personnes)**
```
Classe L1 - Sciences (10 étudiants)
1. Alice Blanc - alice.blanc@student.sorbonne.fr
2. Bruno Chardin - bruno.chardin@student.sorbonne.fr
3. Céline Delas - celine.delas@student.sorbonne.fr
...
10. Xavier Zola - xavier.zola@student.sorbonne.fr

Classe L2 - Lettres (10 étudiants)
11. Ambre Leclaire - ambre.leclaire@student.sorbonne.fr
12. Bernard Mayer - bernard.mayer@student.sorbonne.fr
...
20. Zara Villard - zara.villard@student.sorbonne.fr
```

**Parents (8 personnes - pour 8 étudiants)**
```
1. Parent de Alice: Anne Blanc - anne.blanc@parent.sorbonne.fr
2. Parent de Bruno: Baptiste Chardin - baptiste.chardin@parent.sorbonne.fr
...
8. Parent de Zara: Zoé Villard - zoe.villard@parent.sorbonne.fr
```

### 2.2 Données Utilisateurs Colombia (Bogotá)

**Administrateurs/Directeurs (3 personnes)**
```
1. María González (admin) - maria.gonzalez@unal.edu.co
2. Carlos Rodríguez (director) - carlos.rodriguez@unal.edu.co
3. Daniela López (coordinadora) - daniela.lopez@unal.edu.co
```

**Professeurs (5 personnes)**
```
1. Prof. Diego Martínez (Ingeniería) - diego.martinez@unal.edu.co
2. Prof. Adriana Sánchez (Medicina) - adriana.sanchez@unal.edu.co
3. Prof. Fernando Jiménez (Derecho) - fernando.jimenez@unal.edu.co
4. Prof. Catalina Ruiz (Economía) - catalina.ruiz@unal.edu.co
5. Prof. Juan López (Sistemas) - juan.lopez@unal.edu.co
```

**Étudiants (20 personnes)**
```
Semestre 1 - Ingeniería (10 estudiantes)
1. Andrés Acosta - andres.acosta@student.unal.edu.co
2. Beatriz Borja - beatriz.borja@student.unal.edu.co
...
10. Ximena Ximena - ximena.ximena@student.unal.edu.co

Semestre 1 - Medicina (10 estudiantes)
11. Angela Aguirre - angela.aguirre@student.unal.edu.co
12. Bernardo Bautista - bernardo.bautista@student.unal.edu.co
...
20. Zulema Zamora - zulema.zamora@student.unal.edu.co
```

**Parents (8 personas)**
```
1. Madre de Andrés: Aurora Acosta - aurora.acosta@parent.unal.edu.co
2. Padre de Beatriz: Benilson Borja - benilson.borja@parent.unal.edu.co
...
8. Madre de Zulema: Zoila Zamora - zoila.zamora@parent.unal.edu.co
```

### 2.3 Script SQL pour Bulk Import

**Créer fichier**: `scripts/insert_test_universities.sql`

```sql
-- Université Sorbonne
INSERT INTO public.tenants (name, slug, email, is_active) 
VALUES ('Université de Paris Sorbonne', 'sorbonne-paris', 'contact@sorbonne.fr', true)
RETURNING id AS sorbonne_id;

-- Université Colombia
INSERT INTO public.tenants (name, slug, email, is_active) 
VALUES ('Universidad Nacional de Colombia', 'unal-colombia', 'contact@unal.edu.co', true)
RETURNING id AS colombia_id;

-- Insérer les utilisateurs (voir script Python ci-dessous)
```

**Script Python pour créer les comptes** `scripts/create_test_users.py`:
```python
#!/usr/bin/env python3
import subprocess
import json

universities = {
    "sorbonne": {
        "tenant_id": "SORBONNE_UUID",  # À remplir après création
        "admin": ("admin@sorbonne.fr", "SorbonneAdmin123!"),
        "teachers": [
            ("claude.renault@sorbonne.fr", "Claude Renault"),
            ("isabelle.bernard@sorbonne.fr", "Isabelle Bernard"),
            ("michel.petit@sorbonne.fr", "Michel Petit"),
            ("veronique.rousseau@sorbonne.fr", "Véronique Rousseau"),
            ("laurent.moreau@sorbonne.fr", "Laurent Moreau"),
        ],
        "students": [
            ("alice.blanc@student.sorbonne.fr", "Alice Blanc"),
            ("bruno.chardin@student.sorbonne.fr", "Bruno Chardin"),
            # ... 18 autres
        ],
        "parents": [
            ("anne.blanc@parent.sorbonne.fr", "Anne Blanc"),
            ("baptiste.chardin@parent.sorbonne.fr", "Baptiste Chardin"),
            # ... 6 autres
        ]
    },
    "colombia": {
        "tenant_id": "COLOMBIA_UUID",  # À remplir après création
        "admin": ("admin@unal.edu.co", "ColombiaAdmin123!"),
        "teachers": [
            ("diego.martinez@unal.edu.co", "Diego Martínez"),
            ("adriana.sanchez@unal.edu.co", "Adriana Sánchez"),
            # ... 3 autres
        ],
        "students": [
            ("andres.acosta@student.unal.edu.co", "Andrés Acosta"),
            ("beatriz.borja@student.unal.edu.co", "Beatriz Borja"),
            # ... 18 autres
        ],
        "parents": [
            ("aurora.acosta@parent.unal.edu.co", "Aurora Acosta"),
            ("benilson.borja@parent.unal.edu.co", "Benilson Borja"),
            # ... 6 autres
        ]
    }
}

def create_user(email, password, tenant_id, role, name):
    """Créer un utilisateur via Supabase CLI"""
    cmd = f"supabase functions invoke create-user-test --project-ref local"
    payload = {
        "email": email,
        "password": password,
        "tenant_id": tenant_id,
        "role": role,
        "name": name
    }
    result = subprocess.run(
        cmd,
        input=json.dumps(payload),
        capture_output=True,
        text=True
    )
    return result.returncode == 0

# Création des utilisateurs
for university_name, university_data in universities.items():
    print(f"\n📍 Création des utilisateurs - {university_name.upper()}")
    tenant_id = university_data["tenant_id"]
    
    # Admin
    email, password = university_data["admin"]
    create_user(email, password, tenant_id, "TENANT_ADMIN", email.split("@")[0])
    
    # Professeurs
    for email, name in university_data["teachers"]:
        create_user(email, password, tenant_id, "TEACHER", name)
    
    # Étudiants
    for email, name in university_data["students"]:
        create_user(email, password, tenant_id, "STUDENT", name)
    
    # Parents
    for email, name in university_data["parents"]:
        create_user(email, password, tenant_id, "PARENT", name)

print("\n✅ Création des utilisateurs terminée")
```

---

## 🧪 PHASE 3: TESTS FONCTIONNELS (1.5-2 jours)

### 3.1 Tests Administrateur (Université Sorbonne)

#### 3.1.1 Authentification
- [ ] Accès à http://localhost:8080/
- [ ] Login avec `admin@sorbonne.fr` / `SorbonneAdmin123!`
- [ ] Vérifier redirection vers Dashboard Admin
- [ ] Vérifier "Université de Paris Sorbonne" affichée dans header
- [ ] Vérifier logo de Sorbonne chargé correctement
- [ ] Tester "Mémoriser mes identifiants"
- [ ] Tester Déconnexion
- [ ] Vérifier session persistante après F5 (refresh)

#### 3.1.2 Gestion des Facultés
- [ ] Créer Faculté "Sciences"
- [ ] Créer Faculté "Lettres"
- [ ] Créer Faculté "Droit"
- [ ] Éditer Faculté "Sciences" → Changer description
- [ ] Vérifier isolation: Facultés Sorbonne ≠ Facultés Colombia
- [ ] Archiver Faculté "Droit"
- [ ] Lister facultés actives (uniquement Sciences, Lettres)

#### 3.1.3 Gestion des Niveaux
- [ ] Créer Niveau "L1" (Licence 1ère année)
- [ ] Créer Niveau "L2" (Licence 2e année)
- [ ] Créer Niveau "L3" (Licence 3e année)
- [ ] Créer Niveau "M1" (Master 1)
- [ ] Créer Niveau "M2" (Master 2)
- [ ] Éditer Niveau L1 → Changer capacité
- [ ] Supprimer Niveau M2
- [ ] Vérifier hiérarchie faculté/niveau

#### 3.1.4 Gestion des Classes
- [ ] Créer Classe "L1-Sciences-A" sous Sciences/L1
- [ ] Créer Classe "L1-Sciences-B" sous Sciences/L1
- [ ] Créer Classe "L2-Lettres-A" sous Lettres/L2
- [ ] Éditer Classe L1-Sciences-A → Capacité = 35 étudiants
- [ ] Vérifier professorat par classe (voir section 3.5)
- [ ] Archiver classe
- [ ] Lister classes actives

#### 3.1.5 Gestion des Matières
- [ ] Créer Matière "Mathématiques" (code: MATH-101)
- [ ] Créer Matière "Littérature Française" (code: LIT-201)
- [ ] Créer Matière "Chimie" (code: CHEM-101)
- [ ] Créer Matière "Droit Civil" (code: LAW-101)
- [ ] Éditer Matière: Changer coefficient/crédits
- [ ] Assigner Matière à Classes
- [ ] Vérifier matières par classe

#### 3.1.6 Gestion des Années Académiques
- [ ] Créer Année Académique "2025-2026"
- [ ] Créer Trimestres: T1, T2, T3
- [ ] Définir dates début/fin pour chaque trimestre
- [ ] Activer année académique
- [ ] Vérifier années académiques listées par Sorbonne uniquement

#### 3.1.7 Gestion des Utilisateurs & Rôles
- [ ] Créer Professeur "Claude Renault" 
  - Email: claude.renault@sorbonne.fr
  - Rôle: TEACHER
  - Département: Sciences
- [ ] Créer Directeur "Sophie Martin"
  - Email: sophie.martin@sorbonne.fr
  - Rôle: DIRECTOR
  - Département: Lettres
- [ ] Assigner "Claude Renault" à Classe "L1-Sciences-A"
- [ ] Éditer rôle utilisateur: TEACHER → DIRECTOR
- [ ] Désactiver utilisateur
- [ ] Réactiver utilisateur
- [ ] Vérifier rôles isolés par université

#### 3.1.8 Gestion Financière
- [ ] Créer Frais "Scolarité 2025-2026" (5000 EUR)
- [ ] Créer Frais "Matériel pédagogique" (200 EUR)
- [ ] Créer Facture pour étudiant Alice Blanc
- [ ] Éditer Facture: Changer montant/dates
- [ ] Générer PDF de facture
- [ ] Créer Reçu de paiement
- [ ] Générer Rapport financier
- [ ] Vérifier devise EUR pour Sorbonne

#### 3.1.9 Gestion Paramètres
- [ ] Accéder aux Paramètres Système
- [ ] Éditer:
  - Nom université: "Sorbonne Paris"
  - Logo: Uploader nouvelle image
  - Adresse: "47 Rue des Écoles, 75005 Paris"
  - Téléphone: "+33 1 42 86 82 00"
  - Email: "contact@sorbonne.fr"
- [ ] Modifier Paramètres Académiques:
  - Année académique active
  - Semestres
  - Dates limites inscription
- [ ] Modifier Paramètres Notifications:
  - Activer/Désactiver par type
  - Configurer destinataires
- [ ] Vérifier changements sauvegardés

#### 3.1.10 Audit & Logs
- [ ] Accéder aux Logs Admin
- [ ] Filtrer par date
- [ ] Filtrer par utilisateur
- [ ] Filtrer par action (CREATE, UPDATE, DELETE)
- [ ] Vérifier timestamp exactitude
- [ ] Vérifier détails des modifications

### 3.2 Tests Enseignant (Université Colombia)

#### 3.2.1 Authentification Professeur
- [ ] Login avec `diego.martinez@unal.edu.co` 
- [ ] Vérifier accès Dashboard Professeur
- [ ] Vérifier "Universidad Nacional de Colombia" en header
- [ ] Pas d'accès à Admin Panel
- [ ] Pas d'accès à Paramètres Système

#### 3.2.2 Gestion Notes
- [ ] Voir Liste de Classes assignées:
  - "Semestre 1 - Ingeniería A"
  - "Semestre 1 - Ingeniería B"
- [ ] Ouvrir Classe A
- [ ] Voir 10 étudiants inscrits
- [ ] Saisir notes pour Evaluation T1:
  - Alice: 18/20
  - Bruno: 15/20
  - Céline: 17/20
  - ... (10 étudiants)
- [ ] Sauvegarder notes
- [ ] Éditer note: Bruno 15→16
- [ ] Vérifier calcul automatique de moyenne
- [ ] Exporter notes en CSV
- [ ] Exporter notes en PDF
- [ ] Vérifier formule de calcul (moyenne pondérée)

#### 3.2.3 Gestion Présences
- [ ] Accéder à Présences
- [ ] Marquer présences pour cours d'aujourd'hui:
  - Andrés: PRESENT
  - Beatriz: ABSENT
  - Carmen: LATE (retard 15 min)
  - Diana: EXCUSED (excusé)
  - ... (10 étudiants)
- [ ] Sauvegarder présences
- [ ] Éditer présence: Carmen LATE → PRESENT
- [ ] Générer rapport présence
- [ ] Vérifier statistiques absence par étudiant
- [ ] Exporter liste présence

#### 3.2.4 Gestion Tâches/Devoirs
- [ ] Créer Devoir "Exercices Chapitre 3"
  - Titre: "Exercices Chapitre 3"
  - Description: "Résoudre exercices 1-10 page 45"
  - Date remise: 2025-02-01
  - Points max: 20
- [ ] Assigner devoir à Classe A
- [ ] Voir remises d'étudiants
- [ ] Noter remise: Andrés 18/20 (avec feedback)
- [ ] Noter remise: Beatriz 12/20
- [ ] Éditer note remise
- [ ] Voir statistiques remise:
  - % remises à temps
  - Note moyenne
  - Min/Max
- [ ] Archiver devoir

#### 3.2.5 Gestion Messages/Annonces
- [ ] Créer Annonce:
  - Titre: "Réunion Important - 15 Février"
  - Contenu: "Réunion parents-professeurs 15 février 18h"
  - Destinataires: Classe A
  - Date limite lire: 2025-02-14
- [ ] Voir Annonces créées
- [ ] Éditer Annonce (changer date)
- [ ] Voir % d'étudiants ayant lu
- [ ] Créer Message Privé à Étudiant:
  - À: Andrés Acosta
  - Sujet: "Félicitations pour votre travail"
  - Message: "Excellent travail sur le dernier devoir..."
- [ ] Voir Messages envoyés/reçus
- [ ] Marquer message comme lu

#### 3.2.6 Consultation Données
- [ ] Accéder à Mes Données Personnelles
- [ ] Voir:
  - Nom, Prénom, Email
  - Département assigné
  - Classes enseignées
  - Nombre étudiants totaux
- [ ] Vérifier données correct: "Diego Martínez, Ingeniería"
- [ ] Exporter données personnelles (PDF)

### 3.3 Tests Étudiant (Université Sorbonne)

#### 3.3.1 Authentification Étudiant
- [ ] Login avec `alice.blanc@student.sorbonne.fr`
- [ ] Vérifier accès Dashboard Étudiant
- [ ] Vérifier "Université de Paris Sorbonne" en header
- [ ] Pas d'accès Admin
- [ ] Pas d'accès Professeur

#### 3.3.2 Consultation Notes
- [ ] Accéder à Mes Notes
- [ ] Voir Matières et Notes:
  - Mathématiques: 16/20 (T1), 17/20 (T2)
  - Littérature Française: 14/20 (T1), 15/20 (T2)
  - Chimie: 18/20 (T1), 19/20 (T2)
- [ ] Vérifier moyenne par matière
- [ ] Vérifier moyenne générale
- [ ] Voir courbe de progression
- [ ] Télécharger relevé de notes (PDF)
- [ ] Vérifier notes cohérentes avec saisie prof

#### 3.3.3 Consultation Présences
- [ ] Accéder à Mes Présences
- [ ] Voir Résumé:
  - Total cours: 35
  - Présents: 32
  - Absents: 2
  - Retards: 1
  - Excusés: 0
  - Taux présence: 91.4%
- [ ] Voir Historique présences (liste complète)
- [ ] Voir Alertes si trop d'absences
- [ ] Générer certificat présence

#### 3.3.4 Consultation Devoirs
- [ ] Accéder à Mes Devoirs
- [ ] Voir Devoirs assignés:
  - "Exercices Chapitre 3" - À remettre 2025-02-01
  - "Projet Groupe" - À remettre 2025-02-15
  - "Contrôle Continu" - À remettre 2025-02-08
- [ ] Ouvrir Devoir "Exercices Chapitre 3"
  - Voir description complète
  - Voir date remise
  - Voir fichiers attachés
- [ ] Remettre devoir:
  - Cliquer "Remettre"
  - Uploader fichier (devoir.pdf)
  - Ajouter note/message
  - Soumettre
- [ ] Voir Feedback prof: "18/20 - Excellent travail!"
- [ ] Voir statut remise: "Remis à temps"

#### 3.3.5 Consultation Messages
- [ ] Accéder à Messages
- [ ] Voir Annonces:
  - "Réunion Important - 15 Février" - Non lue
- [ ] Lire Annonce → Marquer comme lue
- [ ] Voir Messages Privés:
  - De Prof. Claude Renault: "Félicitations..."
- [ ] Lire Message privé
- [ ] Répondre au message
- [ ] Voir Conversation complète

#### 3.3.6 Consultation Emploi du Temps
- [ ] Accéder à Mon Emploi du Temps
- [ ] Voir Horaire Semaine:
  - Lundi 09:00-11:00 - Mathématiques (Salle 102)
  - Lundi 14:00-16:00 - Chimie (Labo A)
  - Mardi 10:00-12:00 - Littérature (Salle 205)
  - ... (complet pour semaine)
- [ ] Voir Détails Cours:
  - Professeur
  - Salle/Localisation
  - Durée
  - Matière
- [ ] Voir Emploi du Temps Mois
- [ ] Télécharger Emploi du Temps (PDF/ICS)
- [ ] Exporter vers Calendrier (iCal)

#### 3.3.7 Profil Étudiant
- [ ] Accéder à Mon Profil
- [ ] Voir Données Personnelles:
  - Nom: Alice Blanc
  - Email: alice.blanc@student.sorbonne.fr
  - Niveau: L1
  - Classe: L1-Sciences-A
  - Année académique: 2025-2026
- [ ] Éditer Profil:
  - Téléphone: +33 6 12 34 56 78
  - Photo profil (uploader)
  - Adresse: "123 Rue de la Paix, 75001 Paris"
- [ ] Changer Mot de Passe
- [ ] Voir Historique Connexions

### 3.4 Tests Parent (Université Colombia)

#### 3.4.1 Authentification & Liaison
- [ ] Login avec `aurora.acosta@parent.unal.edu.co`
- [ ] Voir Message: "Aucun enfant lié à votre compte"
- [ ] Initier demande de liaison:
  - Email enfant: andres.acosta@student.unal.edu.co
  - Envoyer code liaison
- [ ] Connecter comme Étudiant Andrés
  - Accéder à Demandes de Liaison
  - Voir demande mère Aurora
  - Confirmer liaison
- [ ] Reconnecter comme Parent Aurora
  - Voir "1 enfant lié"
  - Voir "Andrés Acosta" dans liste

#### 3.4.2 Suivi Enfant - Notes
- [ ] Accéder à "Notes d'Andrés"
- [ ] Voir Notes par Matière:
  - Ingénierie 101: 18/20, 16/20, 17/20
  - Calcul: 19/20, 18/20, 20/20
  - Physique: 15/20, 16/20, 17/20
  - Moyenne générale: 17.67/20
- [ ] Voir Tendance: "En progression ✓"
- [ ] Voir Matières faibles: "Physique (16.67)"
- [ ] Recevoir Alerte si note < 12

#### 3.4.3 Suivi Enfant - Présences
- [ ] Accéder à "Présences d'Andrés"
- [ ] Voir Résumé Mois:
  - Présences: 18/20 (90%)
  - Absences: 2
  - Retards: 0
  - Excusés: 0
- [ ] Voir Graphique présence Mois
- [ ] Voir Détail: Quels jours absent?
- [ ] Recevoir Alerte si trop d'absences

#### 3.4.4 Suivi Enfant - Devoirs
- [ ] Accéder à "Devoirs d'Andrés"
- [ ] Voir Devoirs à remettre:
  - "Projet Calcul" - À remettre 2025-02-01
  - "Rapport Physique" - À remettre 2025-02-10
  - "Exercices Pratiques" - À remettre 2025-02-15
- [ ] Voir Devoirs remis:
  - "Exercices Chapitre 3" - 18/20 ✓
  - "Équations Différentielles" - 17/20 ✓
- [ ] Recevoir Alerte: "Devoir à remettre dans 3 jours"

#### 3.4.5 Communication
- [ ] Voir Messages de Professeurs:
  - De Diego Martínez: "Excellent travail en Ingénierie"
  - De Juan López: "Voir moi après le cours - Projet"
- [ ] Lire Messages
- [ ] Répondre au Prof Diego (si fonctionnalité active)

#### 3.4.6 Profil Parent
- [ ] Accéder à Mon Profil
- [ ] Voir Données:
  - Nom: Aurora Acosta
  - Email: aurora.acosta@parent.unal.edu.co
  - Enfants liés: "Andrés Acosta"
- [ ] Éditer Profil:
  - Téléphone: +57 1 234 5678
  - Photo profil
  - Adresse

---

## 📱 PHASE 4: BUILD MOBILE & TESTS (1 jour)

### 4.1 Préparation Build Capacitor

**1. Vérifier configuration**
```bash
cd c:\Users\cheic\Documents\EduSchool\schoolflow-pro

# Vérifier Capacitor installé
npx cap --version

# Vérifier configuration
cat capacitor.config.ts
```

**2. Build production web**
```bash
npm run build

# Vérifier dist/ créé
ls -la dist/
```

**3. Copier assets dans Capacitor**
```bash
npx cap add android
npx cap add ios

# Copier les fichiers web
npx cap copy
```

### 4.2 Build Android

**Prérequis**: 
- Android Studio installé
- SDK level 21+ 
- Emulateur ou téléphone Android configuré

**Build steps**:
```bash
# Générer APK
npx cap open android

# Dans Android Studio:
# 1. Build → Generate Signed Bundle/APK
# 2. Choisir APK
# 3. Signer avec debug key
# 4. Finish

# Ou depuis ligne de commande:
cd android
./gradlew assembleDebug
cd ..

# APK généré: android/app/build/outputs/apk/debug/app-debug.apk
```

**Installation sur appareil**:
```bash
# Sur émulateur
adb install android/app/build/outputs/apk/debug/app-debug.apk

# Ou via Android Studio (Run)
```

### 4.3 Build iOS

**Prérequis**: 
- macOS (pas disponible sur Windows directement)
- Xcode 14+
- iPhone simulator ou appareil iOS

**Option 1: Sur Mac**
```bash
npx cap open ios

# Dans Xcode:
# 1. Select device/simulator
# 2. Product → Build
# 3. Product → Run
```

**Option 2: Via GitHub Actions** (recommandé)
- Voir [GITHUB_ACTIONS_SETUP_GUIDE.md](GITHUB_ACTIONS_SETUP_GUIDE.md)
- Compiler sur serveur Mac

### 4.4 Tests Android (Émulateur/Appareil)

#### 4.4.1 Test Authentification Mobile
- [ ] Lancer app sur Android
- [ ] Écran splash "SchoolFlow Pro" s'affiche 2 sec
- [ ] Voir écran Login
- [ ] Email input visible
- [ ] Password input visible (avec masquage)
- [ ] Bouton "Se connecter" activé
- [ ] Taper email: `admin@sorbonne.fr`
- [ ] Taper password: `SorbonneAdmin123!`
- [ ] Cliquer "Se connecter"
- [ ] Attendre chargement (spinner visible)
- [ ] Redirection vers Dashboard Admin
- [ ] Nom université "Sorbonne" visible en header
- [ ] Menu hamburger fonctionne
- [ ] Orientation: Portrait et Paysage fonctionnent

#### 4.4.2 Test Navigation Mobile
- [ ] Menu "Accueil" → Accès Dashboard
- [ ] Menu "Facultés" → Liste facultés
- [ ] Menu "Utilisateurs" → Liste utilisateurs
- [ ] Menu "Paramètres" → Paramètres système
- [ ] Menu "Déconnexion" → Logout
- [ ] Swipe retour fonctionne
- [ ] Bottom nav (si implémenté) accessible
- [ ] Back button Android fonctionne

#### 4.4.3 Test Responsivité Mobile
- [ ] Tous les inputs redimensionnés (mobile)
- [ ] Boutons accessibles (taille min 48x48dp)
- [ ] Texte lisible (min 14sp)
- [ ] Images redimensionnées (pas de scroll horizontal)
- [ ] Layout adapté width < 600px
- [ ] Pas d'overflow texte

#### 4.4.4 Test Offline
- [ ] Mode Offline activé (settings Android)
- [ ] App continue fonctionner (données en cache)
- [ ] Essayer connexion sans internet
- [ ] Message "Pas de connexion" visible
- [ ] Data cached accessible
- [ ] Actions en queue
- [ ] Mode Online → Actions envoyées

#### 4.4.5 Test Notifications Push
- [ ] Notification test envoyée depuis Admin
- [ ] Notification reçue sur Android
- [ ] Notification affiche titre + contenu
- [ ] Click notification → Ouvre app correctement
- [ ] Badge nombre visible sur app icon
- [ ] Son notification configuré (si activé)

#### 4.4.6 Test Permissions
- [ ] Lancer app première fois
- [ ] Demander permission caméra (QR code)
- [ ] Demander permission calendrier (emploi du temps)
- [ ] Demander permission notifications
- [ ] Permettre/Refuser fonctionne
- [ ] App adapte comportement selon permissions

#### 4.4.7 Test Performance Mobile
- [ ] Temps démarrage app < 5 sec
- [ ] Dashboard charge < 2 sec
- [ ] Liste avec 100 items scroll fluide
- [ ] Pas de lag lors animations
- [ ] Mémoire: Vérifier via Android Monitor
- [ ] Batterie: Test 30 min utilisation

### 4.5 Tests iOS (Simulator/Appareil)

**Mêmes tests que Android (4.4.1-4.4.7) avec adaptations iOS:**
- [ ] iPhone SE (petit), iPhone 14 Pro (grand)
- [ ] Orientations portrait et landscape
- [ ] Face ID/Touch ID (si implémenté)
- [ ] Gesture swipe retour iOS
- [ ] Status bar adaptée
- [ ] Safe areas respectées (notch, Dynamic Island)
- [ ] iCloud Sync (si applicable)

---

## ✅ PHASE 5: TESTS CROSS-TENANT (4 heures)

### 5.1 Isolation des Données

#### Test 1: Admin Sorbonne ≠ Admin Colombia
```
Connexion: admin@sorbonne.fr
Vérifier visible uniquement:
- Facultés Sorbonne (Sciences, Lettres, Droit)
- Utilisateurs Sorbonne
- Notes/Présences étudiants Sorbonne
- Paramètres Sorbonne

Connexion: admin@unal.edu.co
Vérifier visible uniquement:
- Facultés Colombia (Ingeniería, Salud, Economía)
- Utilisateurs Colombia
- Notes/Présences étudiants Colombia
- Paramètres Colombia
```

#### Test 2: Données Financières Isolées
```
Connexion: admin@sorbonne.fr
- Créer Facture EUR 5000 pour Alice (Sorbonne)
- Vérifier visible seulement en Sorbonne

Connexion: admin@unal.edu.co
- Créer Facture COP 15000 pour Andrés (Colombia)
- Vérifier visible seulement en Colombia
- Vérifier devise COP (pas EUR)

Vérifier Reports:
- Sorbonne: Affiche EUR
- Colombia: Affiche COP
```

#### Test 3: Utilisateurs Cross-Université
```
Créer utilisateur "marie@gmail.com" dans:
- Sorbonne = TEACHER
- Colombia = STUDENT

Login comme marie@gmail.com:
- Dashboard Admin/Teacher Sorbonne
- Dashboard Student Colombia
- Switch university fonctionne
```

#### Test 4: RLS Compliance
```
Query DB directement:
Vérifier que RLS bloque:

-- NE DOIT PAS RETOURNER (bloc par RLS)
SELECT * FROM public.students 
WHERE tenant_id != 'sorbonne-id';

-- DOIT RETOURNER (même tenant)
SELECT * FROM public.students 
WHERE tenant_id = 'sorbonne-id';
```

---

## 🔍 PHASE 6: TESTS DE SÉCURITÉ (2 heures)

### 6.1 Tests OWASP Top 10

#### 6.1.1 SQL Injection
```
Champ Email Input: 
- Taper: `'; DROP TABLE users; --`
- Vérifier: Pas d'erreur SQL, input échappé
- Vérifier: Table users existe toujours
```

#### 6.1.2 XSS (Cross Site Scripting)
```
Champ Description Faculté:
- Taper: `<script>alert('XSS')</script>`
- Sauvegarder
- Charger page
- Vérifier: Pas d'alert, script visible en texte
```

#### 6.1.3 CSRF (Cross Site Request Forgery)
```
Vérifier token CSRF:
- Voir source page
- Vérifier hidden token present
- Changer token, remplir form
- Vérifier: Rejeté (400/403)
```

#### 6.1.4 Authentification Faible
```
- Password "123" → Rejeté (min 8 char)
- Password "pass" → Rejeté (no uppercase/number)
- Password "Abc1234" → Accepté
- Rate limiting: Essayer login 10x avec bad password
  - Vérifier: Account locked après 5 tentatives
```

#### 6.1.5 Contrôle d'Accès Cassé
```
Comme étudiant:
- Essayer accéder /admin/settings → 403 Forbidden
- Essayer modifier user_id dans URL → 403
- Essayer voir notes autre étudiant → 403

Comme prof:
- Essayer accéder /admin/users → 403
- Essayer modifier notes autre classe → 403
```

#### 6.1.6 Exposition de Données Sensibles
```
- Pas de password visible en console
- API responses n'incluent pas passwords
- URLs: Pas d'IDs sensibles exposés
- Logs: Pas de données sensibles loggées
```

#### 6.1.7 Session Security
```
- Token JWT présent en localStorage
- Token validé côté serveur
- Token expiration: 1 heure (config)
- Refresh token: Disponible
- Déconnexion: Token supprimé
```

#### 6.1.8 HTTPS/TLS
```
- En production: HTTPS obligatoire
- Certificat valide
- Pas mixed content (HTTP+HTTPS)
- HSTS header present
```

---

## 📊 PHASE 7: TESTS DE PERFORMANCE (2 heures)

### 7.1 Load Testing avec K6

**Installer k6:**
```bash
# Windows
choco install k6

# Ou:
wget https://github.com/grafana/k6/releases/download/v0.52.0/k6-v0.52.0-windows-amd64.zip
Expand-Archive k6-v0.52.0-windows-amd64.zip -DestinationPath c:\k6
```

**Script test** `scripts/load-test.js`:
```javascript
import http from 'k6/http';
import { check, group, sleep } from 'k6';

const BASE_URL = 'http://localhost:8080';
const LOGIN_URL = `${BASE_URL}/api/auth/login`;
const STUDENTS_URL = `${BASE_URL}/api/students`;

export const options = {
  stages: [
    { duration: '2m', target: 10 },   // Ramp up 10 users over 2 min
    { duration: '5m', target: 50 },   // Ramp up 50 users over 5 min  
    { duration: '5m', target: 50 },   // Stay at 50 users for 5 min
    { duration: '2m', target: 0 },    // Ramp down
  ],
};

export default function() {
  group('Login Flow', () => {
    const payload = JSON.stringify({
      email: 'admin@sorbonne.fr',
      password: 'SorbonneAdmin123!',
    });

    const response = http.post(LOGIN_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
    });

    check(response, {
      'login successful': (r) => r.status === 200,
      'token received': (r) => r.json('access_token') !== undefined,
    });
  });

  sleep(1);

  group('Fetch Students', () => {
    const response = http.get(STUDENTS_URL);
    
    check(response, {
      'status 200': (r) => r.status === 200,
      'has data': (r) => r.json().length > 0,
      'response time < 500ms': (r) => r.timings.duration < 500,
    });
  });

  sleep(2);
}
```

**Exécuter test:**
```bash
k6 run scripts/load-test.js

# Avec output JSON
k6 run scripts/load-test.js --out json=results.json

# Avec Grafana Cloud
k6 run scripts/load-test.js -o cloud
```

### 7.2 Métriques à Vérifier

**Web Vitals:**
- [ ] FCP (First Contentful Paint): < 1.5s
- [ ] LCP (Largest Contentful Paint): < 2.5s
- [ ] CLS (Cumulative Layout Shift): < 0.1
- [ ] TTFB (Time to First Byte): < 600ms

**Backend Metrics:**
- [ ] Réponse API moyenne: < 200ms
- [ ] Réponse API p95: < 500ms
- [ ] Réponse API p99: < 1s
- [ ] Erreurs API: < 0.1%
- [ ] Mémoire serveur: < 500MB
- [ ] CPU utilisation: < 70%

**Database Metrics:**
- [ ] Query temps moyen: < 50ms
- [ ] Query p95: < 200ms
- [ ] Connexions: < 100
- [ ] Lock time: minimal

---

## 📋 PHASE 8: TESTS D'ACCESSIBILITÉ (1 heure)

### 8.1 WCAG 2.1 Compliance

#### 8.1.1 Contraste Couleurs (Level AA)
```
Vérifier avec DevTools:
- Texte noir sur blanc: 21:1 ✓
- Texte blanc sur bleu: 8.1:1 ✓
- Boutons: 4.5:1 minimum ✓

Tool: https://webaim.org/resources/contrastchecker/
```

#### 8.1.2 Keyboard Navigation
```
- Tab travers form
- Shift+Tab retour
- Enter valide form
- Escape ferme modal
- Skip links présents
```

#### 8.1.3 Screen Reader
```
Avec NVDA (gratuit):
- Titres annoncés correctement
- Labels liés aux inputs
- Erreurs annoncées
- Images: alt text présent
- Listes: structure annoncée
```

#### 8.1.4 Responsive Design
```
- Test sur 320px (mobile)
- Test sur 768px (tablet)
- Test sur 1920px (desktop)
- Pas de scroll horizontal
```

---

## 📝 PHASE 9: DOCUMENTATION & RAPPORT (1 jour)

### 9.1 Créer Rapport Test

**Fichier**: `TEST_REPORT_2UNIVERSITIES_FINAL.md`

```markdown
# Rapport de Test Complet - 2 Universités
## Date: 26 Janvier 2026

### Résumé Exécutif
- Universités Testées: 2 (Sorbonne, UNAL)
- Utilisateurs Testés: 56 comptes
- Fonctionnalités Testées: 47
- Durée Test: 4 jours
- Taux Réussite: 98%
- Blockers: 0
- Warnings: 2

### Détails Test

#### Phase 1: Authentification
✅ Login Admin Sorbonne: PASS
✅ Login Admin Colombia: PASS
✅ Login Teacher: PASS
✅ Login Student: PASS
✅ Login Parent: PASS

#### Phase 2: Isolation Données
✅ Admin Sorbonne voit uniquement données Sorbonne: PASS
✅ Admin Colombia voit uniquement données Colombia: PASS
✅ Pas de cross-pollution: PASS

#### Phase 3: Mobile
✅ Android Build: PASS
✅ iOS Build: PASS (via GitHub Actions)
✅ App responsif mobile: PASS
✅ Offline mode: PASS
✅ Push notifications: PASS

#### Phase 4: Performance
✅ Page charge < 2s: PASS
✅ API response < 200ms: PASS
✅ 50 users concurrent: PASS (p95 < 500ms)
✅ Mobile performance: PASS (Lighthouse 85+)

#### Phase 5: Sécurité
✅ SQL Injection: BLOCKED
✅ XSS: BLOCKED
✅ CSRF: PROTECTED
✅ RLS: ENFORCED
✅ HTTPS: READY

### Conclusion
✅ **READY FOR PRODUCTION**

Toutes les fonctionnalités opérationnelles.
2 universités testées avec succès.
Version mobile fonctionnelle.
Pas de blockers critiques.
```

### 9.2 Créer Test Evidence

**Screenshots**:
- Login screens (admin, teacher, student, parent)
- Admin dashboards (2 universités)
- Student notes/attendance
- Mobile app screens (Android + iOS)
- Reports/exports

**Videos**:
- Demonstration complète workflow enseignant
- Demonstration suivi parent
- Test responsivité mobile
- Test offline mode

---

## 🚀 PHASE 10: DEPLOYMENT READINESS (4 heures)

### 10.1 Pre-Production Checklist

```
DATABASE:
- [ ] RLS policies actives
- [ ] Backups configurés (quotidien)
- [ ] Monitoring alertes configurées
- [ ] Connection pooling: 100 connections
- [ ] Indexes optimisés

BACKEND:
- [ ] HTTPS/TLS certificat valide
- [ ] CORS configuré correctement
- [ ] Rate limiting: 100 req/min par IP
- [ ] Logging centralisé (ELK/Datadog)
- [ ] Error tracking (Sentry)

FRONTEND:
- [ ] Build optimisé (4.0MB max)
- [ ] Service Worker installé
- [ ] Offline pages configurées
- [ ] PWA installable
- [ ] Analytics: Google Analytics 4

MOBILE:
- [ ] APK signé (release key)
- [ ] IPA signé (distribution cert)
- [ ] Crash reporting: Firebase
- [ ] Analytics: Firebase Analytics
- [ ] Code push: AppCenter (opt)

INFRASTRUCTURE:
- [ ] CDN: Cloudflare/AWS CloudFront
- [ ] DDoS protection
- [ ] SSL/TLS 1.3
- [ ] WAF rules
- [ ] Load balancer
- [ ] Auto-scaling configured
```

### 10.2 Go-Live Plan

**1. Préparation (Week 1)**
- Backup complète DB production
- Communication aux utilisateurs
- Maintenance window: Samedi 22:00-06:00

**2. Migration (Samedi)**
- 22:00: Disable write access (read-only mode)
- 22:15: Export données anciennes système
- 22:45: Importer données initiales 2 universités
- 23:00: Vérifier intégrité données
- 23:30: Deploy application
- 23:45: Test smoke tests
- 00:00: Enable write access
- 00:15: Monitor (24h)

**3. Post-Launch Support**
- 24/7 support team en place
- Escalation process défini
- Runbook pour problèmes communs

---

## 📞 Support & Contacts

**En cas de problème lors du test:**

1. **Bugs Frontend**
   - Vérifier console (F12 → Console)
   - Prendre screenshot
   - Note les étapes reproduction

2. **Bugs Backend/DB**
   - Logs: `docker logs schoolflow-pro-supabase-db-1`
   - Check PostgREST: `curl http://localhost:8000/rest/v1/tenants`

3. **Problèmes Mobile**
   - Android Logs: `adb logcat | grep schoolflow`
   - iOS Logs: Xcode Console

4. **Question Fonctionnelle**
   - Voir `docs/french/GUIDE_SYSTEME_PARAMETRES_DYNAMIQUES.md`
   - Voir `GETTING_STARTED_FRESH.md`

---

## ⏱️ Timeline Estimée

| Phase | Durée | Dates |
|-------|-------|-------|
| Phase 1: Préparation Données | 1-2h | Jan 26 |
| Phase 2: Créer Utilisateurs | 1h | Jan 26 |
| Phase 3: Tests Fonctionnels | 1.5-2j | Jan 26-27 |
| Phase 4: Build Mobile | 1j | Jan 27 |
| Phase 5: Tests Cross-Tenant | 4h | Jan 28 |
| Phase 6: Tests Sécurité | 2h | Jan 28 |
| Phase 7: Tests Performance | 2h | Jan 28 |
| Phase 8: Tests Accessibilité | 1h | Jan 28 |
| Phase 9: Documentation | 1j | Jan 29 |
| Phase 10: Production Ready | 4h | Jan 29 |
| **TOTAL** | **3-4 jours** | **Jan 26-29** |

---

## 📚 Ressources

### Documentation
- [GETTING_STARTED_FRESH.md](GETTING_STARTED_FRESH.md)
- [docs/french/GUIDE_SYSTEME_PARAMETRES_DYNAMIQUES.md](docs/french/GUIDE_SYSTEME_PARAMETRES_DYNAMIQUES.md)
- [docs/french/GUIDE_ADMIN_PARAMETRES.md](docs/french/GUIDE_ADMIN_PARAMETRES.md)

### Tools
- Supabase Studio: http://localhost:3001/
- Adminer: http://localhost:8082/
- MailHog: http://localhost:8026/
- Postman: Pour API testing

### Commandes Utiles
```bash
# Voir logs
docker logs schoolflow-pro-supabase-db-1
docker logs schoolflow-pro-api-1

# Accéder DB
psql -U postgres -d postgres -h localhost

# Restart services
docker-compose down && docker-compose up -d

# Mobile build
npm run build && npx cap copy

# Tests
npm test
npm run test:coverage
```

---

**✅ Plan Complet Prêt - Commencez Phase 1 dès maintenant!**

Bon Testing! 🎉
