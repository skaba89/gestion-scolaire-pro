#!/usr/bin/env python3
"""
Script Python: Créer les utilisateurs de test pour 2 universités
Crée: 3 admins, 5 professeurs, 20 étudiants, 8 parents par université
Total: 72 utilisateurs de test

Usage:
  python scripts/create_test_users.py
"""

import os
import json
from pathlib import Path
from datetime import datetime
import hashlib
import secrets

# Configuration
SUPABASE_URL = os.environ.get('VITE_SUPABASE_URL', 'http://localhost:8000')
SUPABASE_ANON_KEY = os.environ.get('VITE_SUPABASE_PUBLISHABLE_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9')
DB_HOST = os.environ.get('DB_HOST', 'localhost')
DB_PORT = os.environ.get('DB_PORT', '5432')
DB_NAME = os.environ.get('DB_NAME', 'postgres')
DB_USER = os.environ.get('DB_USER', 'postgres')
DB_PASSWORD = os.environ.get('DB_PASSWORD', 'postgres')

# Données des universités
UNIVERSITIES = {
    "sorbonne": {
        "slug": "sorbonne-paris",
        "name": "Université de Paris Sorbonne",
        "locale": "fr",
        "admin_email": "admin@sorbonne.fr",
        "admin_password": "Sorbonne@2025!",
        "directors": [
            {"email": "sophie.martin@sorbonne.fr", "name": "Sophie Martin", "password": "Sophie@2025!"},
            {"email": "pierre.leclerc@sorbonne.fr", "name": "Pierre Leclerc", "password": "Pierre@2025!"}
        ],
        "teachers": [
            {"email": "claude.renault@sorbonne.fr", "name": "Claude Renault", "password": "Claude@2025!"},
            {"email": "isabelle.bernard@sorbonne.fr", "name": "Isabelle Bernard", "password": "Isabelle@2025!"},
            {"email": "michel.petit@sorbonne.fr", "name": "Michel Petit", "password": "Michel@2025!"},
            {"email": "veronique.rousseau@sorbonne.fr", "name": "Véronique Rousseau", "password": "Veronique@2025!"},
            {"email": "laurent.moreau@sorbonne.fr", "name": "Laurent Moreau", "password": "Laurent@2025!"}
        ],
        "students": [
            {"email": "alice.blanc@student.sorbonne.fr", "name": "Alice Blanc", "password": "Alice@2025!"},
            {"email": "bruno.chardin@student.sorbonne.fr", "name": "Bruno Chardin", "password": "Bruno@2025!"},
            {"email": "celine.delas@student.sorbonne.fr", "name": "Céline Delas", "password": "Celine@2025!"},
            {"email": "daniel.etienne@student.sorbonne.fr", "name": "Daniel Étienne", "password": "Daniel@2025!"},
            {"email": "evelyne.fontaine@student.sorbonne.fr", "name": "Evelyne Fontaine", "password": "Evelyne@2025!"},
            {"email": "frederic.gamache@student.sorbonne.fr", "name": "Frédéric Gamache", "password": "Frederic@2025!"},
            {"email": "gabrielle.henry@student.sorbonne.fr", "name": "Gabrielle Henry", "password": "Gabrielle@2025!"},
            {"email": "henri.isabelle@student.sorbonne.fr", "name": "Henri Isabelle", "password": "Henri@2025!"},
            {"email": "iris.jean@student.sorbonne.fr", "name": "Iris Jean", "password": "Iris@2025!"},
            {"email": "xavier.zola@student.sorbonne.fr", "name": "Xavier Zola", "password": "Xavier@2025!"},
            {"email": "ambre.leclaire@student.sorbonne.fr", "name": "Ambre Leclaire", "password": "Ambre@2025!"},
            {"email": "bernard.mayer@student.sorbonne.fr", "name": "Bernard Mayer", "password": "Bernard@2025!"},
            {"email": "clemence.nadeau@student.sorbonne.fr", "name": "Clémence Nadeau", "password": "Clemence@2025!"},
            {"email": "dominique.olivier@student.sorbonne.fr", "name": "Dominique Olivier", "password": "Dominique@2025!"},
            {"email": "estelle.pelletier@student.sorbonne.fr", "name": "Estelle Pelletier", "password": "Estelle@2025!"},
            {"email": "fabrice.quesnel@student.sorbonne.fr", "name": "Fabrice Quesnel", "password": "Fabrice@2025!"},
            {"email": "genevieve.roux@student.sorbonne.fr", "name": "Geneviève Roux", "password": "Genevieve@2025!"},
            {"email": "herve.salem@student.sorbonne.fr", "name": "Hervé Salem", "password": "Herve@2025!"},
            {"email": "irene.thomas@student.sorbonne.fr", "name": "Irène Thomas", "password": "Irene@2025!"},
            {"email": "zara.villard@student.sorbonne.fr", "name": "Zara Villard", "password": "Zara@2025!"}
        ],
        "parents": [
            {"email": "anne.blanc@parent.sorbonne.fr", "name": "Anne Blanc", "password": "Anne@2025!", "student": "alice.blanc@student.sorbonne.fr"},
            {"email": "baptiste.chardin@parent.sorbonne.fr", "name": "Baptiste Chardin", "password": "Baptiste@2025!", "student": "bruno.chardin@student.sorbonne.fr"},
            {"email": "camille.delas@parent.sorbonne.fr", "name": "Camille Delas", "password": "Camille@2025!", "student": "celine.delas@student.sorbonne.fr"},
            {"email": "david.etienne@parent.sorbonne.fr", "name": "David Étienne", "password": "David@2025!", "student": "daniel.etienne@student.sorbonne.fr"},
            {"email": "elise.fontaine@parent.sorbonne.fr", "name": "Elise Fontaine", "password": "Elise@2025!", "student": "evelyne.fontaine@student.sorbonne.fr"},
            {"email": "francis.gamache@parent.sorbonne.fr", "name": "Francis Gamache", "password": "Francis@2025!", "student": "frederic.gamache@student.sorbonne.fr"},
            {"email": "guillermo.henry@parent.sorbonne.fr", "name": "Guillermo Henry", "password": "Guillermo@2025!", "student": "gabrielle.henry@student.sorbonne.fr"},
            {"email": "zoé.villard@parent.sorbonne.fr", "name": "Zoé Villard", "password": "Zoe@2025!", "student": "zara.villard@student.sorbonne.fr"}
        ]
    },
    "colombia": {
        "slug": "unal-colombia",
        "name": "Universidad Nacional de Colombia",
        "locale": "es",
        "admin_email": "admin@unal.edu.co",
        "admin_password": "Colombia@2025!",
        "directors": [
            {"email": "carlos.rodriguez@unal.edu.co", "name": "Carlos Rodríguez", "password": "Carlos@2025!"},
            {"email": "daniela.lopez@unal.edu.co", "name": "Daniela López", "password": "Daniela@2025!"}
        ],
        "teachers": [
            {"email": "diego.martinez@unal.edu.co", "name": "Diego Martínez", "password": "Diego@2025!"},
            {"email": "adriana.sanchez@unal.edu.co", "name": "Adriana Sánchez", "password": "Adriana@2025!"},
            {"email": "fernando.jimenez@unal.edu.co", "name": "Fernando Jiménez", "password": "Fernando@2025!"},
            {"email": "catalina.ruiz@unal.edu.co", "name": "Catalina Ruiz", "password": "Catalina@2025!"},
            {"email": "juan.lopez@unal.edu.co", "name": "Juan López", "password": "Juan@2025!"}
        ],
        "students": [
            {"email": "andres.acosta@student.unal.edu.co", "name": "Andrés Acosta", "password": "Andres@2025!"},
            {"email": "beatriz.borja@student.unal.edu.co", "name": "Beatriz Borja", "password": "Beatriz@2025!"},
            {"email": "carmen.castillo@student.unal.edu.co", "name": "Carmen Castillo", "password": "Carmen@2025!"},
            {"email": "diego.diaz@student.unal.edu.co", "name": "Diego Díaz", "password": "Diego@2025!"},
            {"email": "elena.escobedo@student.unal.edu.co", "name": "Elena Escobedo", "password": "Elena@2025!"},
            {"email": "felipe.fernandez@student.unal.edu.co", "name": "Felipe Fernández", "password": "Felipe@2025!"},
            {"email": "gloria.garces@student.unal.edu.co", "name": "Gloria Garcés", "password": "Gloria@2025!"},
            {"email": "hector.gutierrez@student.unal.edu.co", "name": "Héctor Gutiérrez", "password": "Hector@2025!"},
            {"email": "ignacio.ibarra@student.unal.edu.co", "name": "Ignacio Ibarra", "password": "Ignacio@2025!"},
            {"email": "ximena.ximena@student.unal.edu.co", "name": "Ximena Ximena", "password": "Ximena@2025!"},
            {"email": "angela.aguirre@student.unal.edu.co", "name": "Ángela Aguirre", "password": "Angela@2025!"},
            {"email": "bernardo.bautista@student.unal.edu.co", "name": "Bernardo Bautista", "password": "Bernardo@2025!"},
            {"email": "catalina.campos@student.unal.edu.co", "name": "Catalina Campos", "password": "Catalina@2025!"},
            {"email": "diana.delgado@student.unal.edu.co", "name": "Diana Delgado", "password": "Diana@2025!"},
            {"email": "enrique.espinosa@student.unal.edu.co", "name": "Enrique Espinosa", "password": "Enrique@2025!"},
            {"email": "facundo.flores@student.unal.edu.co", "name": "Facundo Flores", "password": "Facundo@2025!"},
            {"email": "graciela.garcia@student.unal.edu.co", "name": "Graciela García", "password": "Graciela@2025!"},
            {"email": "humberto.herrera@student.unal.edu.co", "name": "Humberto Herrera", "password": "Humberto@2025!"},
            {"email": "isadora.iglesias@student.unal.edu.co", "name": "Isadora Iglesias", "password": "Isadora@2025!"},
            {"email": "zulema.zamora@student.unal.edu.co", "name": "Zulema Zamora", "password": "Zulema@2025!"}
        ],
        "parents": [
            {"email": "aurora.acosta@parent.unal.edu.co", "name": "Aurora Acosta", "password": "Aurora@2025!", "student": "andres.acosta@student.unal.edu.co"},
            {"email": "benilson.borja@parent.unal.edu.co", "name": "Benilson Borja", "password": "Benilson@2025!", "student": "beatriz.borja@student.unal.edu.co"},
            {"email": "claudio.castillo@parent.unal.edu.co", "name": "Claudio Castillo", "password": "Claudio@2025!", "student": "carmen.castillo@student.unal.edu.co"},
            {"email": "dolores.diaz@parent.unal.edu.co", "name": "Dolores Díaz", "password": "Dolores@2025!", "student": "diego.diaz@student.unal.edu.co"},
            {"email": "esperanza.escobedo@parent.unal.edu.co", "name": "Esperanza Escobedo", "password": "Esperanza@2025!", "student": "elena.escobedo@student.unal.edu.co"},
            {"email": "florencio.fernandez@parent.unal.edu.co", "name": "Florencio Fernández", "password": "Florencio@2025!", "student": "felipe.fernandez@student.unal.edu.co"},
            {"email": "gregorio.garces@parent.unal.edu.co", "name": "Gregorio Garcés", "password": "Gregorio@2025!", "student": "gloria.garces@student.unal.edu.co"},
            {"email": "zoila.zamora@parent.unal.edu.co", "name": "Zoila Zamora", "password": "Zoila@2025!", "student": "zulema.zamora@student.unal.edu.co"}
        ]
    }
}

# SQL Template pour créer un utilisateur
CREATE_USER_SQL = """
INSERT INTO auth.users (email, encrypted_password, email_confirmed_at, created_at)
VALUES ('{email}', crypt('{password}', gen_salt('bf')), NOW(), NOW())
ON CONFLICT (email) DO NOTHING;

INSERT INTO public.profiles (id, tenant_id, email, first_name, last_name, is_active, created_at)
SELECT
  (SELECT id FROM auth.users WHERE email = '{email}'),
  (SELECT id FROM public.tenants WHERE slug = '{tenant_slug}'),
  '{email}',
  '{first_name}',
  '{last_name}',
  true,
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE email = '{email}'
);

INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT
  (SELECT id FROM auth.users WHERE email = '{email}'),
  (SELECT id FROM public.tenants WHERE slug = '{tenant_slug}'),
  '{role}'
WHERE NOT EXISTS (
  SELECT 1 FROM public.user_roles 
  WHERE user_id = (SELECT id FROM auth.users WHERE email = '{email}')
  AND tenant_id = (SELECT id FROM public.tenants WHERE slug = '{tenant_slug}')
);
"""

def generate_sql_file():
    """Génère le fichier SQL complet"""
    output = []
    output.append("-- ============================================")
    output.append("-- Script SQL: Créer utilisateurs test (2 universités)")
    output.append(f"-- Généré: {datetime.now().isoformat()}")
    output.append("-- ============================================\n")
    
    total_users = 0
    
    for univ_key, univ_data in UNIVERSITIES.items():
        output.append(f"\n-- ============================================")
        output.append(f"-- {univ_data['name'].upper()}")
        output.append(f"-- ============================================\n")
        
        # Administrateurs
        output.append(f"-- Administrateur principal\n")
        admin = {
            "email": univ_data["admin_email"],
            "password": univ_data["admin_password"],
            "first_name": univ_data["admin_email"].split("@")[0].capitalize(),
            "last_name": "Admin",
            "role": "TENANT_ADMIN",
            "tenant_slug": univ_data["slug"]
        }
        output.append(CREATE_USER_SQL.format(**admin))
        total_users += 1
        
        # Directeurs
        output.append(f"-- Directeurs ({len(univ_data['directors'])})\n")
        for director in univ_data["directors"]:
            first_name, last_name = director["name"].rsplit(" ", 1)
            user_sql = CREATE_USER_SQL.format(
                email=director["email"],
                password=director["password"],
                first_name=first_name,
                last_name=last_name,
                role="DIRECTOR",
                tenant_slug=univ_data["slug"]
            )
            output.append(user_sql)
            total_users += 1
        
        # Professeurs
        output.append(f"-- Professeurs ({len(univ_data['teachers'])})\n")
        for teacher in univ_data["teachers"]:
            first_name, last_name = teacher["name"].rsplit(" ", 1)
            user_sql = CREATE_USER_SQL.format(
                email=teacher["email"],
                password=teacher["password"],
                first_name=first_name,
                last_name=last_name,
                role="TEACHER",
                tenant_slug=univ_data["slug"]
            )
            output.append(user_sql)
            total_users += 1
        
        # Étudiants
        output.append(f"-- Étudiants ({len(univ_data['students'])})\n")
        for student in univ_data["students"]:
            first_name, last_name = student["name"].rsplit(" ", 1)
            user_sql = CREATE_USER_SQL.format(
                email=student["email"],
                password=student["password"],
                first_name=first_name,
                last_name=last_name,
                role="STUDENT",
                tenant_slug=univ_data["slug"]
            )
            output.append(user_sql)
            total_users += 1
        
        # Parents
        output.append(f"-- Parents ({len(univ_data['parents'])})\n")
        for parent in univ_data["parents"]:
            first_name, last_name = parent["name"].rsplit(" ", 1)
            user_sql = CREATE_USER_SQL.format(
                email=parent["email"],
                password=parent["password"],
                first_name=first_name,
                last_name=last_name,
                role="PARENT",
                tenant_slug=univ_data["slug"]
            )
            output.append(user_sql)
            total_users += 1
    
    # Vérification finale
    output.append("\n-- ============================================")
    output.append("-- Vérification")
    output.append("-- ============================================\n")
    output.append("SELECT 'Statistiques utilisateurs:' as info;")
    output.append("SELECT tenant_id, role, COUNT(*) as count FROM public.user_roles GROUP BY tenant_id, role;")
    output.append(f"\nSELECT 'Total utilisateurs créés: {total_users}' as info;")
    
    return "\n".join(output)

def generate_credentials_file():
    """Génère fichier avec credentials de test"""
    output = []
    output.append("# 🔐 Identifiants de Test - 2 Universités")
    output.append(f"Generated: {datetime.now().isoformat()}\n")
    
    for univ_key, univ_data in UNIVERSITIES.items():
        output.append(f"\n## {univ_data['name']}\n")
        
        # Admin
        output.append("### 👨‍💼 Administrateur")
        output.append(f"- Email: `{univ_data['admin_email']}`")
        output.append(f"- Mot de passe: `{univ_data['admin_password']}`")
        output.append(f"- Rôle: `TENANT_ADMIN`\n")
        
        # Directors
        output.append("### 👔 Directeurs")
        for i, director in enumerate(univ_data["directors"], 1):
            output.append(f"{i}. {director['name']}")
            output.append(f"   - Email: `{director['email']}`")
            output.append(f"   - Mot de passe: `{director['password']}`")
            output.append(f"   - Rôle: `DIRECTOR`")
        output.append("")
        
        # Teachers
        output.append("### 👨‍🏫 Professeurs")
        for i, teacher in enumerate(univ_data["teachers"], 1):
            output.append(f"{i}. {teacher['name']}")
            output.append(f"   - Email: `{teacher['email']}`")
            output.append(f"   - Mot de passe: `{teacher['password']}`")
            output.append(f"   - Rôle: `TEACHER`")
        output.append("")
        
        # Students
        output.append("### 👨‍🎓 Étudiants")
        for i, student in enumerate(univ_data["students"], 1):
            output.append(f"{i}. {student['name']}")
            output.append(f"   - Email: `{student['email']}`")
            output.append(f"   - Mot de passe: `{student['password']}`")
            output.append(f"   - Rôle: `STUDENT`")
        output.append("")
        
        # Parents
        output.append("### 👨‍👩‍👦 Parents")
        for i, parent in enumerate(univ_data["parents"], 1):
            output.append(f"{i}. {parent['name']}")
            output.append(f"   - Email: `{parent['email']}`")
            output.append(f"   - Mot de passe: `{parent['password']}`")
            output.append(f"   - Rôle: `PARENT`")
            output.append(f"   - Enfant: `{parent['student']}`")
        output.append("")
    
    return "\n".join(output)

def main():
    """Génère les fichiers"""
    script_dir = Path("scripts")
    script_dir.mkdir(exist_ok=True)
    
    # Générer SQL
    print("📝 Génération du script SQL...")
    sql_content = generate_sql_file()
    sql_file = script_dir / "insert_test_users.sql"
    sql_file.write_text(sql_content)
    print(f"✅ Fichier SQL créé: {sql_file}")
    
    # Générer fichier credentials
    print("📝 Génération du fichier identifiants...")
    creds_content = generate_credentials_file()
    creds_file = script_dir / "TEST_CREDENTIALS_2UNIVERSITIES.md"
    creds_file.write_text(creds_content)
    print(f"✅ Fichier identifiants créé: {creds_file}")
    
    # Résumé
    print("\n" + "="*60)
    print("RÉSUMÉ CRÉATION UTILISATEURS")
    print("="*60)
    print("\n📊 Statistiques:")
    
    total_by_role = {}
    total_by_univ = {}
    
    for univ_key, univ_data in UNIVERSITIES.items():
        total_by_univ[univ_data['name']] = (
            1 +  # admin
            len(univ_data['directors']) +
            len(univ_data['teachers']) +
            len(univ_data['students']) +
            len(univ_data['parents'])
        )
        
        if 'TENANT_ADMIN' not in total_by_role:
            total_by_role['TENANT_ADMIN'] = 0
        total_by_role['TENANT_ADMIN'] += 1
        
        if 'DIRECTOR' not in total_by_role:
            total_by_role['DIRECTOR'] = 0
        total_by_role['DIRECTOR'] += len(univ_data['directors'])
        
        if 'TEACHER' not in total_by_role:
            total_by_role['TEACHER'] = 0
        total_by_role['TEACHER'] += len(univ_data['teachers'])
        
        if 'STUDENT' not in total_by_role:
            total_by_role['STUDENT'] = 0
        total_by_role['STUDENT'] += len(univ_data['students'])
        
        if 'PARENT' not in total_by_role:
            total_by_role['PARENT'] = 0
        total_by_role['PARENT'] += len(univ_data['parents'])
    
    for univ, count in total_by_univ.items():
        print(f"  {univ}: {count} utilisateurs")
    
    print("\nPar rôle:")
    for role, count in sorted(total_by_role.items()):
        print(f"  {role}: {count}")
    
    total = sum(total_by_role.values())
    print(f"\n  ✅ TOTAL: {total} utilisateurs")
    
    print("\n📂 Fichiers générés:")
    print(f"  - {sql_file}")
    print(f"  - {creds_file}")
    
    print("\n🔧 Prochaines étapes:")
    print("  1. Exécuter le script SQL:")
    print(f"     cat scripts/insert_test_users.sql | psql -h localhost -U postgres -d postgres")
    print("  2. Consulter les identifiants:")
    print(f"     cat scripts/TEST_CREDENTIALS_2UNIVERSITIES.md")

if __name__ == "__main__":
    main()
