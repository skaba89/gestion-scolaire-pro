# Guide de Déploiement - Automatisation de la Gamification

## Prérequis

1. **Supabase CLI** (optionnel mais recommandé)
   ```powershell
   # Installation via npm
   npm install -g supabase
   
   # Ou via Scoop (Windows)
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase
   ```

2. **Accès à votre projet Supabase**
   - URL du projet
   - Clé Service Role (pour les migrations)

---

## Étape 1 : Appliquer les Migrations

### Option A : Via Supabase CLI (Recommandé)

```powershell
# Se connecter à Supabase
supabase login

# Lier le projet local
supabase link --project-ref votre-project-ref

# Appliquer les migrations
supabase db push
```

### Option B : Via le Dashboard Supabase

1. Aller sur [app.supabase.com](https://app.supabase.com)
2. Sélectionner votre projet
3. Aller dans **SQL Editor**
4. Copier-coller le contenu de chaque migration dans l'ordre :
   - `20260216210000_create_gamification_rules.sql`
   - `20260216210100_seed_default_gamification_rules.sql`
5. Exécuter chaque script

---

## Étape 2 : Initialiser les Règles par Défaut

Dans le **SQL Editor** de Supabase, exécuter :

```sql
-- Remplacer 'VOTRE-TENANT-ID' par l'ID de votre tenant
SELECT seed_default_gamification_rules('VOTRE-TENANT-ID');
```

Pour initialiser les règles pour tous les tenants :

```sql
DO $$
DECLARE
  tenant_record RECORD;
BEGIN
  FOR tenant_record IN SELECT id FROM tenants LOOP
    PERFORM seed_default_gamification_rules(tenant_record.id);
  END LOOP;
END $$;
```

---

## Étape 3 : Déployer l'Edge Function

### Via Supabase CLI

```powershell
# Déployer la fonction
supabase functions deploy process-gamification-event

# Vérifier le déploiement
supabase functions list
```

### Via le Dashboard

1. Aller dans **Edge Functions**
2. Créer une nouvelle fonction nommée `process-gamification-event`
3. Copier-coller le code de `supabase/functions/process-gamification-event/index.ts`
4. Déployer

---

## Étape 4 : Configuration des Webhooks (Automatisation Complète)

### Option A : Database Webhooks (Recommandé)

Dans le **SQL Editor**, créer des triggers pour appeler automatiquement l'Edge Function :

```sql
-- Trigger pour les notes
CREATE OR REPLACE FUNCTION trigger_gamification_on_grade()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM net.http_post(
    url := current_setting('app.settings.supabase_url') || '/functions/v1/process-gamification-event',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := jsonb_build_object(
      'event_type', 'GRADE_ADDED',
      'event_id', NEW.id::text,
      'tenant_id', NEW.tenant_id::text,
      'student_id', NEW.student_id::text,
      'event_data', jsonb_build_object(
        'score', NEW.score,
        'subject_id', NEW.subject_id::text
      )
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER gamification_grade_trigger
AFTER INSERT ON grades
FOR EACH ROW
EXECUTE FUNCTION trigger_gamification_on_grade();
```

**Note** : Cette approche nécessite l'extension `pg_net` activée dans Supabase.

### Option B : Appels Manuels depuis le Frontend (Solution Temporaire)

Utiliser les helpers créés dans `gamification-triggers.ts` :

```typescript
import { onGradeAdded } from "@/lib/gamification-triggers";

// Après avoir créé une note
await onGradeAdded(
  gradeId,
  tenantId,
  studentId,
  score,
  subjectId
);
```

---

## Étape 5 : Vérification

### Test Manuel

1. Aller dans **Admin → Gamification → Règles Auto**
2. Vérifier que les règles par défaut sont présentes
3. Créer une note ≥ 18 pour un étudiant
4. Vérifier dans **Points Manager** que +50 points ont été attribués

### Test via SQL

```sql
-- Vérifier les règles actives
SELECT * FROM gamification_rules WHERE is_active = true;

-- Vérifier les événements traités
SELECT * FROM gamification_event_log ORDER BY created_at DESC LIMIT 10;

-- Vérifier les points attribués
SELECT * FROM point_transactions 
WHERE reference_type = 'gamification_rule' 
ORDER BY created_at DESC 
LIMIT 10;
```

---

## Dépannage

### Les règles ne se déclenchent pas

1. Vérifier que les règles sont actives :
   ```sql
   SELECT name, is_active FROM gamification_rules;
   ```

2. Vérifier les logs de l'Edge Function :
   ```powershell
   supabase functions logs process-gamification-event
   ```

3. Vérifier que l'événement n'a pas déjà été traité :
   ```sql
   SELECT * FROM gamification_event_log 
   WHERE event_id = 'votre-event-id';
   ```

### Erreur de permissions

Vérifier les RLS policies :
```sql
-- Désactiver temporairement pour tester (ATTENTION: seulement en dev)
ALTER TABLE gamification_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE gamification_event_log DISABLE ROW LEVEL SECURITY;
```

---

## Prochaines Améliorations

1. **Webhooks Supabase Realtime** : Pour une automatisation complète sans code frontend
2. **Dashboard Analytics** : Visualiser les règles les plus déclenchées
3. **Notifications** : Alerter les étudiants lors de l'attribution de récompenses
4. **Constructeur Visuel** : Interface sans JSON pour créer des règles complexes

---

## Support

Pour toute question, consulter :
- [Documentation Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Documentation Database Webhooks](https://supabase.com/docs/guides/database/webhooks)
- [Walkthrough du projet](file:///C:/Users/cheic/.gemini/antigravity/brain/16a38927-7f73-4f8e-9c1b-c4c1858b373d/walkthrough.md)
