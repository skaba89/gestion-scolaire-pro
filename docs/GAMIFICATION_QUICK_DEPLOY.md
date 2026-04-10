# Guide de Déploiement Rapide - Gamification

## 🚀 Déploiement en 3 Étapes

### Étape 1 : Appliquer les Migrations SQL

1. **Aller sur** [app.supabase.com](https://app.supabase.com)
2. **Sélectionner** votre projet
3. **Cliquer** sur **SQL Editor** (menu de gauche)
4. **Créer** une nouvelle requête

#### Migration 1 : Tables de Gamification

Copier-coller ce code et cliquer sur **Run** :

```sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Table: gamification_rules
CREATE TABLE IF NOT EXISTS gamification_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'GRADE_ADDED',
    'ATTENDANCE_PRESENT',
    'HOMEWORK_SUBMITTED',
    'PERFECT_SCORE',
    'ATTENDANCE_STREAK',
    'GRADE_IMPROVEMENT'
  )),
  conditions JSONB NOT NULL DEFAULT '{}',
  reward_type TEXT NOT NULL CHECK (reward_type IN ('POINTS', 'BADGE')),
  reward_value INT,
  reward_badge_id UUID REFERENCES badges_definitions(id) ON DELETE SET NULL,
  is_active BOOLEAN DEFAULT true,
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_reward CHECK (
    (reward_type = 'POINTS' AND reward_value IS NOT NULL) OR
    (reward_type = 'BADGE' AND reward_badge_id IS NOT NULL)
  )
);

-- Table: gamification_event_log
CREATE TABLE IF NOT EXISTS gamification_event_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  event_id UUID NOT NULL,
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  rules_applied JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_type, event_id, student_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gamification_rules_tenant ON gamification_rules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gamification_rules_event_type ON gamification_rules(event_type);
CREATE INDEX IF NOT EXISTS idx_gamification_rules_active ON gamification_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_gamification_event_log_tenant ON gamification_event_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gamification_event_log_student ON gamification_event_log(student_id);
CREATE INDEX IF NOT EXISTS idx_gamification_event_log_event ON gamification_event_log(event_type, event_id);

-- RLS Policies
ALTER TABLE gamification_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE gamification_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view rules for their tenant"
  ON gamification_rules FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Admins can manage rules"
  ON gamification_rules FOR ALL
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "Users can view event logs for their tenant"
  ON gamification_event_log FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "System can insert event logs"
  ON gamification_event_log FOR INSERT
  WITH CHECK (true);
```

✅ **Vérifier** : Message de succès

---

#### Migration 2 : Règles Par Défaut

Copier-coller ce code et cliquer sur **Run** :

```sql
CREATE OR REPLACE FUNCTION seed_default_gamification_rules(p_tenant_id UUID)
RETURNS void AS $$
DECLARE
  v_badge_id UUID;
BEGIN
  -- Créer le badge "Étudiant Assidu" s'il n'existe pas
  INSERT INTO badges_definitions (tenant_id, name, description, icon, color, points_required)
  VALUES (
    p_tenant_id,
    'Étudiant Assidu',
    'Présent 30 jours consécutifs',
    '🔥',
    '#FF6B6B',
    0
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_badge_id;

  -- Si le badge existe déjà, récupérer son ID
  IF v_badge_id IS NULL THEN
    SELECT id INTO v_badge_id
    FROM badges_definitions
    WHERE tenant_id = p_tenant_id AND name = 'Étudiant Assidu'
    LIMIT 1;
  END IF;

  -- Insérer les règles par défaut
  INSERT INTO gamification_rules (tenant_id, name, description, event_type, conditions, reward_type, reward_value, reward_badge_id, priority)
  VALUES
    (p_tenant_id, 'Excellence Académique', 'Note supérieure ou égale à 18/20', 'GRADE_ADDED', '{"min_score": 18}'::jsonb, 'POINTS', 50, NULL, 10),
    (p_tenant_id, 'Perfectionniste', 'Note parfaite de 20/20', 'PERFECT_SCORE', '{"score": 20}'::jsonb, 'POINTS', 100, NULL, 20),
    (p_tenant_id, 'Présence Quotidienne', 'Présent en cours', 'ATTENDANCE_PRESENT', '{}'::jsonb, 'POINTS', 5, NULL, 5),
    (p_tenant_id, 'Devoir à Temps', 'Devoir rendu avant la deadline', 'HOMEWORK_SUBMITTED', '{"on_time": true}'::jsonb, 'POINTS', 10, NULL, 8),
    (p_tenant_id, 'Amélioration Continue', 'Amélioration de 5 points ou plus', 'GRADE_IMPROVEMENT', '{"min_improvement": 5}'::jsonb, 'POINTS', 25, NULL, 15),
    (p_tenant_id, 'Assiduité Exemplaire', '30 jours de présence consécutifs', 'ATTENDANCE_STREAK', '{"consecutive_days": 30}'::jsonb, 'BADGE', NULL, v_badge_id, 25)
  ON CONFLICT DO NOTHING;

END;
$$ LANGUAGE plpgsql;
```

✅ **Vérifier** : Message de succès

---

#### Migration 3 : Correctif Onboarding (Bonus)

Copier-coller ce code et cliquer sur **Run** :

```sql
ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR',
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS address TEXT;
```

✅ **Vérifier** : Message de succès

---

### Étape 2 : Initialiser les Règles

**Trouver votre Tenant ID** :

```sql
SELECT id, name, slug FROM tenants;
```

**Initialiser les règles** (remplacer `VOTRE-TENANT-ID`) :

```sql
SELECT seed_default_gamification_rules('VOTRE-TENANT-ID');
```

✅ **Vérifier** : Message "Success. No rows returned"

---

### Étape 3 : Vérifier

**Vérifier les règles créées** :

```sql
SELECT name, event_type, reward_type, reward_value, is_active 
FROM gamification_rules 
WHERE tenant_id = 'VOTRE-TENANT-ID';
```

✅ **Résultat attendu** : 6 règles affichées

---

## ✅ C'est Terminé !

Votre système de gamification est maintenant déployé !

**Prochaines étapes** :
1. Aller dans **Admin → Gamification → Règles Auto**
2. Vérifier que les règles sont visibles
3. Tester en créant une note ≥ 18 pour un étudiant
4. Vérifier que +50 points sont attribués

---

## 🆘 Problèmes ?

**"Relation tenants does not exist"** → Vérifier que vous êtes sur le bon projet Supabase

**"No rows returned"** après seed → C'est normal ! Les règles ont été créées

**"Permission denied"** → Vérifier que vous êtes connecté avec les bons droits

---

**Besoin d'aide ?** Consultez [GAMIFICATION_COMPLETE_SETUP.md](file:///c:/Users/cheic/Documents/EduSchool/schoolflow-pro/docs/GAMIFICATION_COMPLETE_SETUP.md)
