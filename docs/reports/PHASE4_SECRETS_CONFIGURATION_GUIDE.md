# PHASE 4: Production Secrets Configuration Guide
**How to Create and Manage .env.production**

**Document Version:** 1.0  
**Created:** January 27, 2026  
**Last Updated:** January 27, 2026  
**Classification:** INTERNAL - CONFIDENTIAL

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Prerequisites](#prerequisites)
3. [Secrets Generation](#secrets-generation)
4. [Configuration Steps](#configuration-steps)
5. [Validation Checklist](#validation-checklist)
6. [Security Best Practices](#security-best-practices)
7. [Troubleshooting](#troubleshooting)

---

## 📍 Overview

The `.env.production` file contains all sensitive configuration for production deployment. This guide walks through creating it securely.

**Key Points:**
- ⚠️ **NEVER** commit `.env.production` to git
- 🔒 **ALWAYS** restrict file permissions (chmod 600)
- 🔐 **STORE** secrets in a secure vault (AWS Secrets Manager, Vault, etc.)
- ✅ **VERIFY** all values before deployment
- 📝 **DOCUMENT** secret rotation schedule

---

## 🔧 Prerequisites

Before starting, ensure you have:

✅ **Access to:**
- AWS account (for S3, IAM, KMS)
- Supabase production project
- SendGrid account (or SMTP provider)
- Sentry account
- Datadog/New Relic accounts
- PostgreSQL production database
- Redis instance
- FCM/Firebase project

✅ **Tools:**
```bash
# Install required tools
brew install openssl  # Generate random secrets
brew install aws-cli  # AWS management
npm install -g @supabase/cli  # Supabase management
```

✅ **Permissions:**
- DevOps/Infrastructure admin access
- Database admin access
- AWS account access
- Team lead approval

---

## 🔐 Secrets Generation

### Step 1: Generate Cryptographic Secrets

Use these commands to generate secure random values:

#### JWT_SECRET (32+ characters)
```bash
openssl rand -base64 32
# Example output: j4K9pL2mN6qR8sT1uV3wX5yZ7aB0cD2eF4gH6iJ8kL0mN2o
```

#### API_SECRET_KEY
```bash
openssl rand -base64 32
```

#### BACKUP_ENCRYPTION_KEY
```bash
openssl rand -base64 32
```

#### PII_ENCRYPTION_KEY
```bash
openssl rand -base64 32
```

#### REDIS_PASSWORD
```bash
openssl rand -base64 16
```

### Step 2: Generate AWS Credentials

```bash
# 1. Login to AWS Console → IAM → Users
# 2. Create new user: "schoolflow-prod"
# 3. Attach policy: AmazonS3FullAccess (or custom policy)
# 4. Generate access key pair
# 5. Save securely:
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=wJal...

# Test credentials:
aws s3 ls --region eu-west-1
```

### Step 3: Retrieve Supabase Keys

```bash
# From Supabase Dashboard:
# 1. Settings → API → Project URL → VITE_SUPABASE_URL
# 2. Settings → API → anon public key → VITE_SUPABASE_PUBLISHABLE_KEY
# 3. Settings → API → service_role secret → SUPABASE_SERVICE_ROLE_KEY

# Verify:
curl -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  $VITE_SUPABASE_URL/rest/v1/tenants
```

### Step 4: Get SendGrid API Key

```bash
# 1. SendGrid Dashboard → Settings → API Keys
# 2. Create new API key (Full Access for production)
# 3. Copy value → SENDGRID_API_KEY & SMTP_PASSWORD

# Test:
curl --request POST \
  --url https://api.sendgrid.com/v3/mail/send \
  --header "Authorization: Bearer $SENDGRID_API_KEY"
```

### Step 5: Get Sentry DSN

```bash
# 1. Sentry Dashboard → Projects → SchoolFlow Pro
# 2. Settings → Client Keys → Copy DSN
# 3. Format: https://[key]@[server]/[projectid]

# Verify:
curl $SENTRY_DSN
```

---

## 🛠️ Configuration Steps

### Step 1: Create Base .env.production

```bash
# Copy template
cp .env.production.secrets.template .env.production

# Restrict permissions (IMPORTANT!)
chmod 600 .env.production

# Verify it's not readable by others
ls -la .env.production
# Should show: -rw------- (600)
```

### Step 2: Fill Database Secrets

```bash
# Edit .env.production
nano .env.production

# Fill database section:
DATABASE_URL=postgresql://schoolflow_prod:[PASSWORD]@host:5432/schoolflow_db?sslmode=require
POSTGRES_PASSWORD=[GENERATED_PASSWORD]
PGBOUNCER_URL=postgresql://schoolflow_prod:[PASSWORD]@pgbouncer:6432/schoolflow_db
```

**PostgreSQL Test:**
```bash
psql -h prod-db.example.com -U schoolflow_prod -d schoolflow_db \
  -c "SELECT version();"
```

### Step 3: Fill Supabase Secrets

```bash
# From Supabase Dashboard
VITE_SUPABASE_URL=https://[project].supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=eyJhbGc...
SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
```

**Supabase Test:**
```bash
curl -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  "$VITE_SUPABASE_URL/rest/v1/tenants?limit=1"
```

### Step 4: Fill Authentication Secrets

```bash
# Use generated JWT_SECRET
JWT_SECRET=j4K9pL2mN6qR8sT1uV3wX5yZ7aB0cD2eF4gH6iJ8kL0mN2o
GOTRUE_JWT_SECRET=j4K9pL2mN6qR8sT1uV3wX5yZ7aB0cD2eF4gH6iJ8kL0mN2o

# JWT configuration
JWT_EXPIRY=3600
GOTRUE_JWT_EXP=3600
JWT_REFRESH_EXPIRY=604800
```

### Step 5: Fill Email Secrets

```bash
# SendGrid
SENDGRID_API_KEY=[your_sendgrid_key]
SMTP_PASSWORD=[same_as_sendgrid_key]
SMTP_FROM_ADDRESS=noreply@schoolflowpro.com
SMTP_HOST=smtp.sendgrid.net

# Test email:
curl --request POST \
  --url https://api.sendgrid.com/v3/mail/send \
  --header "Authorization: Bearer $SENDGRID_API_KEY" \
  --header "Content-Type: application/json" \
  --data '{"personalizations":[{"to":[{"email":"test@example.com"}]}],"from":{"email":"noreply@schoolflowpro.com"},"subject":"Test"}'
```

### Step 6: Fill AWS S3 Secrets

```bash
# AWS credentials (from IAM)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=wJal...
AWS_REGION=eu-west-1
AWS_S3_BUCKET=schoolflow-pro-production

# CloudFront
AWS_CLOUDFRONT_DOMAIN=d123abc.cloudfront.net
AWS_CLOUDFRONT_KEY_PAIR_ID=APKAJ...
AWS_CLOUDFRONT_PRIVATE_KEY=[base64_encoded_private_key]

# Test S3 access:
aws s3 ls s3://schoolflow-pro-production/ --region eu-west-1
```

### Step 7: Fill Monitoring Secrets

```bash
# Sentry
SENTRY_DSN=https://[key]@[server]/[projectid]
SENTRY_ENVIRONMENT=production

# Datadog
DATADOG_API_KEY=[your_datadog_key]
DATADOG_APP_KEY=[your_datadog_app_key]

# New Relic
NEW_RELIC_LICENSE_KEY=[your_license_key]

# Test Sentry:
curl -X POST $SENTRY_DSN \
  -H "Content-Type: application/json" \
  -d '{"exception":"test","level":"info"}'
```

### Step 8: Fill Backup Secrets

```bash
# Encryption keys (generate new)
BACKUP_ENCRYPTION_KEY=aB1cD2eF3gH4iJ5kL6mN7oP8qR9sT0u
PII_ENCRYPTION_KEY=xY1aB2cD3eF4gH5iJ6kL7mN8oP9qR0s

# Backup settings
BACKUP_ENABLED=true
BACKUP_SCHEDULE="0 2 * * *"
BACKUP_RETENTION_DAYS=30
PITR_RETENTION_DAYS=7
```

### Step 9: Fill Redis Secrets

```bash
# Generate Redis password
REDIS_PASSWORD=[openssl_generated_value]

# Redis connection
REDIS_URL=redis://:[PASSWORD]@prod-redis.example.com:6379/0
```

**Test Redis:**
```bash
redis-cli -h prod-redis.example.com -p 6379 \
  -a [PASSWORD] PING
# Should return: PONG
```

### Step 10: Fill Optional Services

```bash
# Analytics (optional)
GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX
MIXPANEL_TOKEN=[token]

# Feature flags (optional)
LAUNCHDARKLY_SDK_KEY=[key]

# Mobile (optional)
CAPACITOR_PACKAGE_ID=com.schoolflowpro.app
FIREBASE_CONFIG={...}
```

---

## ✅ Validation Checklist

Before deployment, verify all secrets are correctly set:

```bash
#!/bin/bash

# Load .env.production
source .env.production

echo "🔍 Validating .env.production..."
echo ""

# Database
if [ -z "$DATABASE_URL" ]; then
  echo "❌ DATABASE_URL is not set"
else
  echo "✅ DATABASE_URL is set"
fi

# JWT
if [ ${#JWT_SECRET} -lt 32 ]; then
  echo "❌ JWT_SECRET must be >= 32 characters"
else
  echo "✅ JWT_SECRET is set (${#JWT_SECRET} chars)"
fi

# AWS
if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
  echo "❌ AWS credentials are missing"
else
  echo "✅ AWS credentials are set"
fi

# Supabase
if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ SUPABASE_SERVICE_ROLE_KEY is not set"
else
  echo "✅ SUPABASE_SERVICE_ROLE_KEY is set"
fi

# SMTP
if [ -z "$SENDGRID_API_KEY" ]; then
  echo "❌ SENDGRID_API_KEY is not set"
else
  echo "✅ SENDGRID_API_KEY is set"
fi

# Sentry
if [ -z "$SENTRY_DSN" ]; then
  echo "❌ SENTRY_DSN is not set"
else
  echo "✅ SENTRY_DSN is set"
fi

# Backup
if [ -z "$BACKUP_ENCRYPTION_KEY" ]; then
  echo "❌ BACKUP_ENCRYPTION_KEY is not set"
else
  echo "✅ BACKUP_ENCRYPTION_KEY is set"
fi

echo ""
echo "Validation complete!"
```

---

## 🔒 Security Best Practices

### 1. File Permissions

```bash
# Set restrictive permissions
chmod 600 .env.production
chmod 600 .env.production.secrets.template

# Verify
ls -la .env.production*
# Should show: -rw------- (600 permissions)
```

### 2. Git Protection

```bash
# Add to .gitignore
echo ".env.production" >> .gitignore
echo ".env.production.backup" >> .gitignore
echo ".env.*.local" >> .gitignore

# Use git-secrets to prevent leaks
brew install git-secrets
git secrets --install
git secrets --add '.env.production'
git secrets --add 'JWT_SECRET'
git secrets --add 'SENDGRID_API_KEY'
```

### 3. Secret Rotation

Create a rotation schedule:

```markdown
## Secret Rotation Schedule

- **Monthly:**
  - JWT_SECRET
  - API_SECRET_KEY
  - Redis password

- **Quarterly:**
  - AWS credentials
  - Supabase keys
  - Database password

- **Bi-annually:**
  - Encryption keys
  - Backup passwords
  - API tokens

- **Annually:**
  - SSL certificates
  - All third-party integrations
```

### 4. Access Audit

```bash
# Who accessed secrets?
cd /path/to/.env.production
last  # Check system access logs

# AWS CLI audit
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=.env.production

# Git history audit
git log --all -p -- .env.production
# Should be empty (file should never be in git)
```

### 5. Encrypted Backup

```bash
# Create encrypted backup
gpg --symmetric .env.production
# Creates .env.production.gpg

# Restore from backup
gpg --decrypt .env.production.gpg > .env.production.restored
```

---

## 🚀 Deployment Checklist

Before running `deploy-production.sh`:

### Pre-Deployment Validation

- [ ] `.env.production` exists and is readable
- [ ] All [REPLACE_*] placeholders are replaced
- [ ] File permissions are 600 (chmod 600 .env.production)
- [ ] Database connection test passed
- [ ] AWS credentials validated
- [ ] Supabase keys verified
- [ ] SMTP connection successful
- [ ] Sentry DSN is active
- [ ] Redis connection works
- [ ] Backup encryption key is stored securely
- [ ] All team members notified
- [ ] Backup of current environment taken

### Deployment

```bash
# 1. Navigate to project
cd /path/to/schoolflow-pro

# 2. Verify .env.production exists
test -f .env.production && echo "✅ .env.production exists" || echo "❌ Missing!"

# 3. Load environment
source .env.production

# 4. Test database connection
psql "$DATABASE_URL" -c "SELECT NOW();"

# 5. Run deployment
./deploy-production.sh

# 6. Monitor health checks
node health-check.cjs
```

### Post-Deployment

- [ ] All services healthy (health-check.cjs)
- [ ] API endpoints responding
- [ ] Database operations working
- [ ] Monitoring systems active
- [ ] Alerts functioning
- [ ] Logs aggregating
- [ ] Backup system operational
- [ ] Team notified of successful deployment

---

## 🔧 Troubleshooting

### Database Connection Error

```bash
# Check DATABASE_URL format
echo $DATABASE_URL

# Test connection
psql "$DATABASE_URL" -c "SELECT 1;"

# Common issues:
# - Wrong password: Check POSTGRES_PASSWORD
# - Wrong host: Verify prod-db hostname
# - SSL required: Add ?sslmode=require
# - Connection pool: Check PGBOUNCER_URL
```

### AWS S3 Credentials Invalid

```bash
# Test AWS credentials
aws s3 ls --region eu-west-1

# Check IAM policy
aws iam get-user-policy --user-name schoolflow-prod --policy-name S3FullAccess

# Regenerate if needed
# 1. AWS Console → IAM → Users → schoolflow-prod
# 2. Delete old access keys
# 3. Create new access key pair
# 4. Update .env.production
```

### JWT_SECRET Too Short

```bash
# JWT_SECRET must be >= 32 characters
echo $JWT_SECRET | wc -c

# If too short, regenerate:
openssl rand -base64 32
# Then update .env.production
```

### SendGrid Not Working

```bash
# Verify API key
curl -X GET https://api.sendgrid.com/v3/user/email \
  -H "Authorization: Bearer $SENDGRID_API_KEY" \
  -H "Content-Type: application/json"

# Check SMTP settings
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASSWORD=$SENDGRID_API_KEY
```

---

## 📊 Secret Inventory

Track all secrets created:

| Secret | Generated Date | Expiry | Rotation Date | Status |
|--------|---|---|---|---|
| JWT_SECRET | 2026-01-27 | 2027-01-27 | 2026-04-27 | ✅ Active |
| AWS_ACCESS_KEY_ID | 2026-01-27 | Never | 2026-04-27 | ✅ Active |
| SENDGRID_API_KEY | 2026-01-27 | Never | 2026-04-27 | ✅ Active |
| SENTRY_DSN | 2026-01-27 | Never | N/A | ✅ Active |

---

## 📞 Support

If you encounter issues:

1. **Check this guide first** - Most common issues are documented
2. **Review logs** - Check `docker logs schoolflow-api`
3. **Contact DevOps** - Reach out to infrastructure team
4. **Security incident?** - Contact security@schoolflowpro.com immediately

---

**Status:** READY FOR PRODUCTION SETUP  
**Version:** 1.0  
**Last Updated:** January 27, 2026  
**Owner:** DevOps Team  
**Approval:** [TBD - Tech Lead signature]

---

## 🔐 Security Reminder

> ⚠️ **CRITICAL SECURITY NOTICE**
>
> This document contains information about accessing production secrets.
> **HANDLE WITH CARE.**
>
> - Never share this document in plain text
> - Never paste secrets in chat or email
> - Never commit secrets to git
> - Always use secure channels for secret sharing
> - Audit all secret access
> - Rotate secrets regularly
> - Report compromised secrets immediately

