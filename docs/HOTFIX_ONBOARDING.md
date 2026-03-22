# 🚨 CORRECTIF URGENT - Erreur d'Onboarding

## Problème
L'onboarding échoue avec l'erreur : `Column 'country' of relation 'tenants' does not exist`

## Solution Rapide (2 minutes)

### Étape 1 : Accéder au Dashboard Supabase
1. Aller sur [app.supabase.com](https://app.supabase.com)
2. Sélectionner votre projet
3. Cliquer sur **SQL Editor** dans le menu de gauche

### Étape 2 : Exécuter la Migration

Copier-coller ce code SQL et cliquer sur **Run** :

```sql
-- Migration: Add missing columns to tenants table
-- Description: Add country, currency, phone, email, and address columns for onboarding

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR',
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS address TEXT;

-- Add comments
COMMENT ON COLUMN tenants.country IS 'ISO country code (e.g., FR, US, GN)';
COMMENT ON COLUMN tenants.currency IS 'Currency code (e.g., EUR, USD, GNF)';
COMMENT ON COLUMN tenants.phone IS 'Contact phone number';
COMMENT ON COLUMN tenants.email IS 'Contact email address';
COMMENT ON COLUMN tenants.address IS 'Physical address of the establishment';
```

### Étape 3 : Vérifier
Exécuter cette requête pour confirmer que les colonnes existent :

```sql
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'tenants' 
  AND column_name IN ('country', 'currency', 'phone', 'email', 'address');
```

**Résultat attendu** : 5 lignes affichées

### Étape 4 : Réessayer l'Onboarding
1. Retourner sur votre application
2. Rafraîchir la page (F5)
3. Réessayer de créer l'établissement "La Source"

---

## ✅ C'est tout !

L'onboarding devrait maintenant fonctionner correctement.

---

## Alternative : Via CLI (si installé)

```powershell
cd c:\Users\cheic\Documents\EduSchool\schoolflow-pro
supabase db push
```

---

## Fichier de Migration

Le fichier complet est disponible ici :
[20260216220000_add_tenant_contact_fields.sql](file:///c:/Users/cheic/Documents/EduSchool/schoolflow-pro/supabase/migrations/20260216220000_add_tenant_contact_fields.sql)
