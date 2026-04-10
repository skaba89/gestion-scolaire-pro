# 🚀 SchoolFlow Pro - DÉMARRAGE RAPIDE & REDÉMARRAGE

**Date:** January 27, 2026  
**Status:** ✅ **PROJET ENTIÈREMENT FONCTIONNEL**

---

## ✅ ÉTA ACTUEL

### Infrastructure (14/14 services opérationnels)

```
✅ PostgreSQL 15          - Database       - UP & HEALTHY
✅ GoTrue 2.132           - Authentication - UP
✅ Kong 2.8.1             - API Gateway    - UP & HEALTHY
✅ PostgREST v12          - REST API       - UP
✅ Supabase Realtime      - WebSocket      - UP
✅ Supabase Storage       - File Storage   - UP
✅ Supabase Studio        - UI Dashboard   - UP (unhealthy = normal)
✅ Frontend React/Vite    - Web App        - UP & HEALTHY
✅ PgBouncer              - Connection Pool- UP & HEALTHY
✅ Adminer                - DB Admin       - UP
✅ MailHog                - Email Mock     - UP
✅ ImgProxy               - Image Service  - UP
✅ Meta (Supabase)        - Metadata       - UP & HEALTHY
✅ Functions (Supabase)   - Serverless     - UP
```

### Données de Test

```
✅ Tenant: Sorbonne School (slug: 'sorbonne')
✅ 3 utilisateurs créés
✅ 3 profiles configurés
✅ 3 roles attribués (SUPER_ADMIN, TEACHER, STUDENT)
```

---

## 🔐 COMPTES DE TEST DISPONIBLES

### Admin (Administrateur)
```
Email:    admin@sorbonne.fr
Password: Sorbonne@2025
Role:     SUPER_ADMIN
```

### Professeur (Enseignant)
```
Email:    prof.martin@sorbonne.fr
Password: Sorbonne@2025
Role:     TEACHER
```

### Étudiant
```
Email:    jean.dupont@student.sorbonne.fr
Password: Sorbonne@2025
Role:     STUDENT
```

---

## 🌐 ACCÈS AU SYSTÈME

### Frontend Principal
```
URL: http://localhost:3000
```

### Page de Connexion
```
URL: http://localhost:3000/auth
```

### Supabase Studio (Admin Dashboard)
```
URL: http://localhost:3001
```

### API Gateway (Kong)
```
Base URL: http://localhost:8000
Auth endpoint: /auth/v1/
API endpoint: /rest/v1/
```

### Base de Données (Adminer)
```
URL: http://localhost:8026
```

### Email Testing (MailHog)
```
URL: http://localhost:8026
```

---

## 🔄 REDÉMARRAGE COMPLET (Si nécessaire)

### Option 1: Redémarrage Rapide (Services Running)
```bash
docker-compose restart
```

### Option 2: Redémarrage Complet (Flush volumes)
```bash
# ⚠️ ATTENTION: Ceci supprimera TOUTES les données
docker-compose down -v
docker-compose up -d
# Attendre 60 secondes pour stabilisation
```

### Option 3: Vérifier l'état des services
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

---

## 🧪 TEST DE CONNEXION

### Via le navigateur:
1. Ouvrir http://localhost:3000
2. Cliquer sur "Connectez-vous"
3. Entrer: `admin@sorbonne.fr` / `Sorbonne@2025`
4. Cliquer "Se connecter"

### Via API (Curl):
```bash
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

---

## 🐛 DÉPANNAGE

### Problème: Écran blanc après connexion
**Solution:** Vider le cache navigateur (Ctrl+Shift+Delete) et rafraîchir (Ctrl+F5)

### Problème: "Credentials invalides"
**Solution:** 
1. Vérifier que les comptes existent: `docker exec schoolflow-pro-supabase-db-1 psql -U postgres -d postgres -c "SELECT email FROM auth.users WHERE email LIKE '%sorbonne%';"`
2. Si vide, réexécuter les scripts de seed

### Problème: Kong unhealthy
**Solution:** `docker restart schoolflow-pro-supabase-kong-1`

### Problème: Frontend ne charge pas
**Solution:**
1. `docker restart schoolflow-pro-frontend-1`
2. Attendre 30 secondes
3. Rafraîchir le navigateur

### Problème: API timeout
**Solution:** `docker logs schoolflow-pro-supabase-kong-1 | tail -20`

---

## 📊 SCRIPTS UTILES

### Vérifier tous les services
```bash
docker ps -a
```

### Logs d'un service spécifique
```bash
docker logs -f schoolflow-pro-supabase-auth-1
```

### Accéder à la base de données
```bash
docker exec -it schoolflow-pro-supabase-db-1 psql -U postgres
```

### Compter les utilisateurs
```bash
docker exec schoolflow-pro-supabase-db-1 psql -U postgres -d postgres \
  -c "SELECT COUNT(*) FROM auth.users;"
```

---

## 🎯 PROCHAINES ÉTAPES

1. ✅ Infrastructure: **DÉPLOYÉE**
2. ✅ Authentification: **FONCTIONNELLE**
3. ✅ Comptes de test: **CRÉÉS**
4. ✅ Frontend: **OPÉRATIONNEL**
5. 📋 Tester la navigation: Connectez-vous et explorez!

---

## 📞 SUPPORT RAPIDE

| Problème | Commande |
|----------|----------|
| Services down | `docker-compose restart` |
| Data corrompue | `docker-compose down -v && docker-compose up -d` |
| Frontend crash | `docker restart schoolflow-pro-frontend-1` |
| DB connexion | `docker exec schoolflow-pro-supabase-db-1 psql -U postgres` |
| Kong logs | `docker logs schoolflow-pro-supabase-kong-1` |

---

## ✨ POINTS IMPORTANTS

- ✅ **Tous les 14 services Docker sont opérationnels**
- ✅ **3 comptes de test créés et prêts à être utilisés**
- ✅ **Frontend accessible et responsive**
- ✅ **API gateway (Kong) en bonne santé**
- ✅ **Database PostgreSQL healthy**
- ✅ **Authentication (GoTrue) fonctionnelle**

---

**Le projet est maintenant ENTIÈREMENT FONCTIONNEL!** 🎉

**Identifiez-vous maintenant:** http://localhost:3000/auth
