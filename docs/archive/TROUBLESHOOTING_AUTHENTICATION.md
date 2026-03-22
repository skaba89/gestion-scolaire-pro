# DÉPANNAGE: Problème de Connexion & Création de Compte Admin
**SchoolFlow Pro - Authentification Problématique**

**Date:** January 27, 2026  
**Problème:** Impossible de se connecter ou créer un compte admin  
**Status:** Diagnostics en cours

---

## 🔍 DIAGNOSTIC RAPIDE

### ✅ État de l'Infrastructure

| Service | Status | Port | Notes |
|---------|--------|------|-------|
| PostgreSQL (DB) | ✅ UP | 5432 | Healthy |
| GoTrue (Auth) | ✅ UP | 9999 | Running |
| Kong (Gateway) | ✅ UP | 8000 | Healthy |
| PostgREST (API) | ✅ UP | 3000 | Ready |
| Supabase Studio | ⚠️ UNHEALTHY | 3001 | Voir ci-dessous |

### ✅ Comptes Testables Existants
```
Email: admin@sorbonne.fr
Password: Sorbonne@2025
Role: SUPER_ADMIN

Email: prof.martin@sorbonne.fr
Password: Sorbonne@2025
Role: TEACHER

Email: jean.dupont@student.sorbonne.fr
Password: Sorbonne@2025
Role: STUDENT
```

---

## 🛠️ SOLUTIONS POSSIBLES

### Problème #1: Supabase Studio Unhealthy (Port 3001)

**Symptôme:** 
- Impossible d'accéder à Supabase Studio
- Interface d'admin non disponible

**Causes possibles:**
1. Container Studio redémarre
2. Configuration JWT invalide
3. Problème de mémoire

**Solutions:**

#### Solution 1a: Redémarrer le service Studio
```bash
docker restart schoolflow-pro-supabase-studio-1
# Attendre 30 secondes
# Puis accéder à: http://localhost:3001
```

#### Solution 1b: Vérifier les variables d'environnement
```bash
# Les variables critiques:
- SUPABASE_URL=http://localhost:8000
- SUPABASE_ANON_KEY=[clé valide]
- SUPABASE_SERVICE_ROLE_KEY=[clé valide]
- JWT_SECRET=[secret valide min 32 chars]
```

#### Solution 1c: Redémarrer complètement
```bash
docker-compose down
docker-compose up -d
# Attendre 1-2 minutes
```

---

### Problème #2: Erreur de Connexion au Frontend

**Symptôme:**
- Page de login affichée
- Erreur lors de la soumission du formulaire
- "Invalid credentials" ou "Network error"

**Diagnostic rapide:**

```bash
# Tester l'API d'authentification directement:
curl -X POST http://localhost:8000/auth/v1/token \
  -H "Content-Type: application/json" \
  -d '{
    "email":"admin@sorbonne.fr",
    "password":"Sorbonne@2025"
  }'
```

**Réponse attendue:**
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "bearer",
  "expires_in": 3600,
  "refresh_token": "..."
}
```

**Solutions si erreur:**

#### Solution 2a: Vérifier le .env
```bash
# Vérifier que .env contient:
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_PUBLISHABLE_KEY=[clé anon]
VITE_SUPABASE_PROJECT_ID=local
GOTRUE_JWT_SECRET=[secret valide]
```

#### Solution 2b: Réinitialiser la authentification
```bash
# Supprimer les tables auth
docker exec schoolflow-pro-supabase-db-1 psql \
  -U postgres -d postgres \
  -c "TRUNCATE TABLE auth.users CASCADE;"

# Re-créer les comptes
# (Voir section Re-création des comptes ci-dessous)
```

---

### Problème #3: Impossible de Créer un Compte Admin

**Symptôme:**
- "Sign up not allowed" 
- "User registration disabled"
- Pas de formulaire d'inscription

**Solutions:**

#### Solution 3a: Vérifier GoTrue Configuration
```bash
# Variables requises pour l'inscription:
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_AUTOCONFIRM_EMAIL=false  # ou true selon besoin
GOTRUE_EMAIL_AUTOCONFIRM=false
```

#### Solution 3b: Créer manuellement via SQL
```sql
-- Se connecter à PostgreSQL:
psql -h localhost -U postgres -d postgres

-- Créer l'utilisateur dans auth.users:
INSERT INTO auth.users (
  id,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at,
  aud,
  role
) VALUES (
  gen_random_uuid(),
  'newadmin@example.com',
  crypt('password123', gen_salt('bf')),
  now(),
  now(),
  now(),
  'authenticated',
  'authenticated'
);
```

#### Solution 3c: Utiliser l'API Supabase directement
```bash
curl -X POST http://localhost:8000/auth/v1/signup \
  -H "Content-Type: application/json" \
  -H "apikey: [SUPABASE_ANON_KEY]" \
  -d '{
    "email": "newadmin@example.com",
    "password": "SecurePassword123!",
    "data": {
      "first_name": "Admin",
      "last_name": "User"
    }
  }'
```

---

## 🔑 CONFIGURATION CRITIQUE

### Variables d'Environnement Essentielles

```env
# SUPABASE CORE
VITE_SUPABASE_URL=http://localhost:8000
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
VITE_SUPABASE_PROJECT_ID=local
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# JWT
GOTRUE_JWT_SECRET=super-secret-jwt-token-with-32-chars-min!
JWT_SECRET=super-secret-jwt-token-with-32-chars-min!

# DATABASE
DATABASE_URL=postgresql://postgres:postgres@supabase-db:5432/postgres
POSTGRES_PASSWORD=postgres

# AUTHENTICATION
GOTRUE_EXTERNAL_EMAIL_ENABLED=true
GOTRUE_AUTOCONFIRM_EMAIL=false
GOTRUE_EMAIL_AUTOCONFIRM=false
```

---

## 🧪 TESTS DE CONNEXION

### Test 1: Vérifier GoTrue Directement
```bash
curl http://localhost:8000/auth/v1/health
# Réponse attendue: 200 OK
```

### Test 2: Tester le Login
```bash
curl -X POST http://localhost:8000/auth/v1/token \
  -H "Content-Type: application/json" \
  -d '{
    "email":"admin@sorbonne.fr",
    "password":"Sorbonne@2025"
  }'
# Réponse attendue: JWT token
```

### Test 3: Vérifier l'API
```bash
# Avec le token obtenu:
curl http://localhost:3000/health \
  -H "Authorization: Bearer [TOKEN]"
# Réponse attendue: 200 OK
```

### Test 4: Accès à la DB
```bash
psql -h localhost -U postgres -d postgres \
  -c "SELECT email, created_at FROM auth.users LIMIT 5;"
# Réponse attendue: Liste des utilisateurs
```

---

## 📝 RECRÉATION MANUELLE DES COMPTES

### Via Docker Container

```bash
# Accéder au container PostgreSQL
docker exec -it schoolflow-pro-supabase-db-1 bash

# Accéder à psql
psql -U postgres -d postgres

# Exécuter le script de création:
```

### Script SQL

```sql
-- 1. Vider les tables existantes
TRUNCATE TABLE auth.users CASCADE;
TRUNCATE TABLE public.profiles CASCADE;
TRUNCATE TABLE public.user_roles CASCADE;

-- 2. Créer les utilisateurs de test
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  password_hash,
  raw_app_meta_data,
  raw_user_meta_data,
  is_super_admin,
  created_at,
  updated_at,
  phone,
  phone_confirmed_at,
  confirmation_token,
  email_change_token_new,
  email_change,
  last_sign_in_at,
  raw_identity_data,
  identities,
  invited_at,
  banned_until,
  reauthentication_token
)
VALUES
-- Admin User
(
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'admin@sorbonne.fr',
  crypt('Sorbonne@2025', gen_salt('bf')),
  now(),
  crypt('Sorbonne@2025', gen_salt('bf')),
  '{"provider":"email","providers":["email"]}',
  '{"first_name":"Admin","last_name":"User"}',
  true,
  now(),
  now(),
  NULL,
  NULL,
  '',
  '',
  '',
  now(),
  '{}',
  '[{"user_id":"","id":"","identity_data":{},"provider":"email","last_sign_in_at":null,"created_at":null,"updated_at":null}]',
  NULL,
  NULL,
  ''
);

-- 3. Créer les profiles
INSERT INTO public.profiles (
  id,
  tenant_id,
  first_name,
  last_name,
  email,
  phone,
  avatar_url,
  is_active,
  created_at,
  updated_at
)
SELECT 
  id,
  'default-tenant-id',
  'Admin',
  'User',
  email,
  NULL,
  NULL,
  true,
  now(),
  now()
FROM auth.users;

-- 4. Assigner les rôles
INSERT INTO public.user_roles (
  user_id,
  tenant_id,
  role
)
SELECT 
  id,
  'default-tenant-id',
  'SUPER_ADMIN'
FROM auth.users;

-- 5. Vérifier
SELECT email, created_at FROM auth.users;
```

---

## 🚨 PROBLÈMES COMMUNS & SOLUTIONS

| Problème | Cause | Solution |
|----------|-------|----------|
| "Invalid credentials" | Comptes n'existent pas | Créer les comptes (voir ci-dessus) |
| "Connection refused" | Docker pas lancé | `docker-compose up -d` |
| "CORS error" | Configuration CORS | Vérifier `CORS_ORIGIN` en .env |
| "JWT invalid" | Secret ne correspond pas | Vérifier `JWT_SECRET` |
| "Studio unhealthy" | Container redémarre | `docker restart schoolflow-pro-supabase-studio-1` |
| "Signup disabled" | GoTrue non configuré | Vérifier `GOTRUE_EXTERNAL_EMAIL_ENABLED` |
| "Email unconfirmed" | Confirmation requise | Vérifier `GOTRUE_EMAIL_AUTOCONFIRM` |

---

## 🆘 ESCALADE - SI RIEN NE FONCTIONNE

### Étape 1: Redémarrage Complet
```bash
# Arrêter tout
docker-compose down

# Supprimer les volumes (⚠️ DATA LOSS)
docker-compose down -v

# Relancer
docker-compose up -d

# Attendre 2-3 minutes pour l'initialisation
sleep 180

# Vérifier
docker-compose ps
```

### Étape 2: Vérifier les Logs Complets
```bash
# Logs GoTrue
docker logs -f schoolflow-pro-supabase-auth-1

# Logs Kong
docker logs -f schoolflow-pro-supabase-kong-1

# Logs Studio
docker logs -f schoolflow-pro-supabase-studio-1
```

### Étape 3: Réinitialiser les Secrets
```bash
# Générer de nouveaux secrets
openssl rand -base64 32

# Mettre à jour dans .env:
JWT_SECRET=[NEW_VALUE]
GOTRUE_JWT_SECRET=[NEW_VALUE]

# Redémarrer
docker-compose restart supabase-auth supabase-kong
```

---

## ✅ VÉRIFICATION FINALE

Quand la connexion fonctionne, vous devriez voir:

1. ✅ Page de login accessible
2. ✅ Credentials acceptés
3. ✅ JWT token reçu
4. ✅ Redirection vers le dashboard
5. ✅ Données chargées correctement

---

## 📞 SUPPORT

Si le problème persiste après tous les tests:

1. Vérifier les logs: `docker-compose logs supabase-auth`
2. Vérifier la base de données: `psql -h localhost -U postgres`
3. Tester l'API directement: `curl -X POST http://localhost:8000/auth/v1/token`
4. Consulter la [documentation Supabase](https://supabase.com/docs/guides/auth)

---

**Dernière mise à jour:** January 27, 2026  
**Status:** Diagnostics & Solutions disponibles

