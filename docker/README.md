# 🐳 Self-Hosting Docker Guide

## Prérequis

- Docker Desktop (ou Docker + Docker Compose)
- Au moins 4GB de RAM disponible
- Git

## 🚀 Démarrage Rapide

### 1. Cloner le projet

```bash
git clone <votre-repo>
cd <nom-du-projet>
```

### 2. Configurer les variables d'environnement

⚠️ **Important** : ce repo utilise déjà `.env` pour l'app (variables `VITE_*`). **Ne l'écrasez pas.**

Créez plutôt un fichier dédié à Docker :

```bash
# Copier le fichier d'exemple
cp .env.example .env.docker.local

# (Optionnel) Générer des secrets (Linux/Mac)
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env.docker.local
echo "SECRET_KEY_BASE=$(openssl rand -base64 64)" >> .env.docker.local
echo "POSTGRES_PASSWORD=$(openssl rand -base64 24)" >> .env.docker.local
```

Puis lancez Docker avec :

```bash
docker compose --env-file .env.docker.local up -d --build
```

Si vous avez déjà lancé la stack avec un autre `POSTGRES_PASSWORD` (volumes existants), réinitialisez :

```bash
docker compose --env-file .env.docker.local down -v
```

### 3. Générer les clés Supabase

Utilisez le générateur officiel ou créez-les manuellement:

```bash
# Installer le CLI Supabase (optionnel)
npm install -g supabase

# Ou générer manuellement avec jwt.io en utilisant votre JWT_SECRET
```

Pour générer les clés JWT:
1. Allez sur https://jwt.io
2. Utilisez votre `JWT_SECRET` comme secret
3. Créez un token avec le payload:
   - Pour `anon`: `{"role": "anon", "iss": "supabase", "iat": <timestamp>, "exp": <timestamp+10years>}`
   - Pour `service_role`: `{"role": "service_role", "iss": "supabase", "iat": <timestamp>, "exp": <timestamp+10years>}`

### 4. Démarrer les services

```bash
docker compose --env-file .env.docker.local up -d --build
```

### 5. Exécuter les migrations

```bash
# Attendre que la base soit prête (environ 30s)
sleep 30

# Exécuter les migrations depuis les fichiers SQL (optionnel)
for file in supabase/migrations/*.sql; do
  docker compose --env-file .env.docker.local exec -T supabase-db psql -U supabase_admin -d postgres -f - < "$file"
done
```

## 📍 URLs des Services

| Service | URL | Description |
|---------|-----|-------------|
| Application | http://localhost:3000 | Frontend React |
| Supabase Studio | http://localhost:3001 | Dashboard Supabase |
| API Gateway | http://localhost:8000 | Kong Gateway |
| MailHog | http://localhost:8026 | Interface emails (dev) |
| PostgreSQL | localhost:5432 | Base de données |

## 🔧 Commandes Utiles

```bash
# Voir les logs
docker-compose logs -f

# Logs d'un service spécifique
docker-compose logs -f frontend
docker-compose logs -f supabase-db

# Redémarrer un service
docker-compose restart frontend

# Arrêter tous les services
docker-compose down

# Supprimer les volumes (ATTENTION: perte de données)
docker-compose down -v

# Reconstruire le frontend
docker-compose build frontend
docker-compose up -d frontend
```

## 🗄️ Accès à la Base de Données

```bash
# Via Docker
docker-compose exec supabase-db psql -U postgres

# Ou avec un client externe
# Host: localhost
# Port: 5432
# User: postgres
# Password: <votre POSTGRES_PASSWORD>
# Database: postgres
```

## 📧 Configuration Email (Production)

Pour la production, remplacez MailHog par un vrai service SMTP:

```env
SMTP_HOST=smtp.resend.com
SMTP_PORT=587
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxx
SMTP_ADMIN_EMAIL=noreply@votredomaine.com
```

## 🔒 Sécurité en Production

1. **Changez tous les mots de passe** dans `.env.local`
2. **Utilisez HTTPS** avec un reverse proxy (nginx/traefik)
3. **Limitez les ports exposés** (ne gardez que 80/443)
4. **Configurez un firewall**
5. **Activez les backups** de la base de données

## 🆘 Dépannage

### La base ne démarre pas
```bash
docker-compose logs supabase-db
# Vérifiez les permissions des volumes
docker-compose down -v && docker-compose up -d
```

### L'auth ne fonctionne pas
```bash
# Vérifiez que les clés JWT sont correctes
docker-compose logs supabase-auth
```

### Le frontend ne se charge pas
```bash
docker-compose logs frontend
# Reconstruisez si nécessaire
docker-compose build --no-cache frontend
```

## 📚 Documentation

- [Supabase Self-Hosting](https://supabase.com/docs/guides/self-hosting)
- [Lovable Self-Hosting](https://docs.lovable.dev/tips-tricks/self-hosting)
