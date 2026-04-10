# 🧪 DONNÉES DE TEST - GUIDE DE CRÉATION

**Date:** January 27, 2026  
**Status:** ✅ Données de test supprimées - Base prête pour VOS tests

---

## 📋 INFORMATIONS IMPORTANTES

**Tenant existant:**
```
Name:  Sorbonne School
Slug:  sorbonne
Type:  SCHOOL
```

**La base de données est maintenant VIDE.** Vous pouvez créer vos propres utilisateurs et tester l'inscription/connexion!

---

## 🧑‍💼 DONNÉES RECOMMANDÉES POUR VOS TESTS

### Format: Email | Password | Prénom | Nom | Rôle

```
admin@test.fr | Test@1234 | Admin | Test | SUPER_ADMIN
prof@test.fr | Prof@1234 | Professeur | Test | TEACHER
student@test.fr | Student@1234 | Étudiant | Test | STUDENT
parent@test.fr | Parent@1234 | Parent | Test | PARENT
```

### Ou si vous préférez garder Sorbonne:

```
admin@sorbonne.fr | Sorbonne@2025 | Admin | Sorbonne | SUPER_ADMIN
prof@sorbonne.fr | Sorbonne@2025 | Professeur | Sorbonne | TEACHER
student@sorbonne.fr | Sorbonne@2025 | Étudiant | Sorbonne | STUDENT
```

---

## 🚀 COMMENT TESTER

### Option 1: Créer via Frontend (Page d'inscription)

1. Ouvrir: http://localhost:3000/auth
2. Cliquer sur "Créer un compte" 
3. Remplir le formulaire avec les données ci-dessus
4. Envoyer

### Option 2: Créer via API (Curl/Postman)

```bash
curl -X POST http://localhost:8000/auth/v1/signup \
  -H "Content-Type: application/json" \
  -H "apikey: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MTcwMDAwMDAwLCJlbWFpbCI6ImFub24iLCJlbWFpbF9jb25maXJtZWQiOnRydWUsInBob25lX2NvbmZpcm1lZCI6ZmFsc2UsInN1YiI6IjAwMDAwMDAwLTAwMDAtMDAwMC0wMDAwLTAwMDAwMDAwMDAwMCIsImF1ZCI6ImF1dGhlbnRpY2F0ZWQiLCJjb25maXJtZWRfYXQiOm51bGwsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7fSwidXNlcl9tZXRhZGF0YSI6e30sImlzX3N1cGVyX2FkbWluIjpmYWxzZX0.9Jh0r3nOzGmBYQ0Jl5N7K3M2P8Q1R4S5T6U7V8W9X0" \
  -d '{
    "email": "admin@test.fr",
    "password": "Test@1234",
    "data": {
      "first_name": "Admin",
      "last_name": "Test"
    }
  }'
```

**Réponse attendue:**
```json
{
  "user": {
    "id": "uuid-xxx",
    "email": "admin@test.fr",
    "created_at": "2026-01-27T..."
  }
}
```

### Option 3: Créer directement en SQL

Voir section "Créer via SQL" ci-dessous.

---

## 🗄️ CRÉER VIA SQL (Direct Database)

### Script pour un utilisateur:

```sql
-- Créer l'utilisateur
INSERT INTO auth.users (
  id, instance_id, email, aud, role
) VALUES (
  gen_random_uuid(), 
  '00000000-0000-0000-0000-000000000000'::uuid, 
  'admin@test.fr', 
  'authenticated', 
  'authenticated'
);

-- Créer le profil
INSERT INTO public.profiles (id, tenant_id, first_name, last_name, email, is_active, created_at, updated_at)
SELECT 
  u.id,
  t.id,
  'Admin', 'Test', u.email, true, now(), now()
FROM auth.users u, public.tenants t
WHERE u.email = 'admin@test.fr' AND t.slug = 'sorbonne';

-- Assigner le rôle
INSERT INTO public.user_roles (user_id, tenant_id, role)
SELECT u.id, t.id, 'SUPER_ADMIN'
FROM auth.users u, public.tenants t
WHERE u.email = 'admin@test.fr' AND t.slug = 'sorbonne';
```

### Exécuter le script:

```bash
# 1. Sauvegarder dans un fichier: my-test-user.sql

# 2. Copier dans le container
docker cp my-test-user.sql schoolflow-pro-supabase-db-1:/tmp/

# 3. Exécuter
docker exec schoolflow-pro-supabase-db-1 psql -U postgres -d postgres -f /tmp/my-test-user.sql
```

---

## 🧪 TESTER LA CONNEXION

### Après avoir créé vos utilisateurs:

1. **Aller sur:** http://localhost:3000/auth
2. **Cliquer:** "Déjà un compte? Connectez-vous"
3. **Entrer les credentials:** Exemple: `admin@test.fr` / `Test@1234`
4. **Vérifier:** Vous devriez être redirigé vers le dashboard

### Tester via API:

```bash
curl -X POST http://localhost:8000/auth/v1/token \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@test.fr",
    "password": "Test@1234"
  }'
```

---

## 📊 VÉRIFIER VOS UTILISATEURS

### Via SQL:

```bash
docker exec schoolflow-pro-supabase-db-1 psql -U postgres -d postgres \
  -c "SELECT email, created_at FROM auth.users ORDER BY created_at;"
```

### Via Adminer (UI):
1. Ouvrir: http://localhost:8026
2. Sélectionner "auth" dans le panneau
3. Cliquer sur "users"

---

## ✅ POINTS DE TEST RECOMMANDÉS

### Frontend:
- [ ] Inscription avec email/password
- [ ] Validation des champs (email invalide, password faible)
- [ ] Connexion réussie
- [ ] Redirection après connexion
- [ ] Déconnexion
- [ ] Changement de mot de passe

### Backend:
- [ ] Endpoint `/auth/v1/signup` - Création utilisateur
- [ ] Endpoint `/auth/v1/token` - Connexion
- [ ] Endpoint `/auth/v1/logout` - Déconnexion
- [ ] RLS (Row Level Security) - Isolation des données par tenant
- [ ] JWT token validation

### Database:
- [ ] Vérifier les enregistrements `auth.users`
- [ ] Vérifier les enregistrements `public.profiles`
- [ ] Vérifier les enregistrements `public.user_roles`
- [ ] Vérifier les associations tenant_id

---

## 🛠️ COMMANDES UTILES

### Accéder à la DB:
```bash
docker exec -it schoolflow-pro-supabase-db-1 psql -U postgres -d postgres
```

### Compter les utilisateurs:
```bash
docker exec schoolflow-pro-supabase-db-1 psql -U postgres -d postgres \
  -c "SELECT COUNT(*) FROM auth.users;"
```

### Supprimer un utilisateur:
```sql
DELETE FROM public.user_roles WHERE user_id = 'uuid-here';
DELETE FROM public.profiles WHERE id = 'uuid-here';
DELETE FROM auth.users WHERE id = 'uuid-here';
```

### Voir tous les utilisateurs et leurs rôles:
```bash
docker exec schoolflow-pro-supabase-db-1 psql -U postgres -d postgres << 'EOF'
SELECT 
  u.email, 
  p.first_name, 
  p.last_name, 
  ur.role,
  u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
LEFT JOIN public.user_roles ur ON u.id = ur.user_id
ORDER BY u.created_at DESC;
EOF
```

---

## 🌐 INFRASTRUCTURE TOUJOURS DISPONIBLE

```
✅ Frontend:           http://localhost:3000
✅ Auth Page:          http://localhost:3000/auth
✅ API Gateway:        http://localhost:8000
✅ Supabase Studio:    http://localhost:3001
✅ Adminer (DB UI):    http://localhost:8026
✅ MailHog (Emails):   http://localhost:8026
```

---

## ✨ RÉSUMÉ

| Point | Status |
|-------|--------|
| ✅ Infrastructure | 14/14 services UP |
| ✅ Frontend | Opérationnel |
| ✅ Backend | Opérationnel |
| ✅ Database | Vide et prête |
| ✅ Données de test | SUPPRIMÉES |
| 📝 Vos tâches | À CRÉER |

---

**Vous êtes maintenant prêt à créer vos propres comptes de test et à explorer le système!** 🎉

Utilisez les données recommandées ci-dessus ou créez les vôtres. L'infrastructure est là pour supporter vos tests.

Bon test! 🚀
