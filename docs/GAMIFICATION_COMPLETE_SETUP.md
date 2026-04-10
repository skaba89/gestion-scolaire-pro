# Guide Complet : Déploiement et Intégration de la Gamification

Ce guide vous accompagne pas à pas pour déployer et intégrer complètement le système d'automatisation de la gamification.

---

## 📋 Table des Matières

1. [Déploiement du Système](#1-déploiement-du-système)
2. [Intégration dans les Composants](#2-intégration-dans-les-composants)
3. [Personnalisation des Règles](#3-personnalisation-des-règles)
4. [Fonctionnalités Avancées](#4-fonctionnalités-avancées)

---

## 1. Déploiement du Système

### Étape 1.1 : Appliquer les Migrations

**Option A : Via Dashboard Supabase (Recommandé)**

1. Aller sur [app.supabase.com](https://app.supabase.com)
2. Sélectionner votre projet
3. Cliquer sur **SQL Editor** dans le menu de gauche
4. Créer une nouvelle requête

**Migration 1 : Créer les tables**

```sql
-- Copier le contenu de : supabase/migrations/20260216210000_create_gamification_rules.sql

-- Enable UUID extension if not already enabled
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

5. Cliquer sur **Run** (ou F5)
6. Vérifier le message de succès

**Migration 2 : Seed des règles par défaut**

```sql
-- Copier le contenu de : supabase/migrations/20260216210100_seed_default_gamification_rules.sql

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
    -- Règle 1: Excellence Académique
    (p_tenant_id, 'Excellence Académique', 'Note supérieure ou égale à 18/20', 'GRADE_ADDED', '{"min_score": 18}'::jsonb, 'POINTS', 50, NULL, 10),
    
    -- Règle 2: Perfectionniste
    (p_tenant_id, 'Perfectionniste', 'Note parfaite de 20/20', 'PERFECT_SCORE', '{"score": 20}'::jsonb, 'POINTS', 100, NULL, 20),
    
    -- Règle 3: Présence Quotidienne
    (p_tenant_id, 'Présence Quotidienne', 'Présent en cours', 'ATTENDANCE_PRESENT', '{}'::jsonb, 'POINTS', 5, NULL, 5),
    
    -- Règle 4: Devoir à Temps
    (p_tenant_id, 'Devoir à Temps', 'Devoir rendu avant la deadline', 'HOMEWORK_SUBMITTED', '{"on_time": true}'::jsonb, 'POINTS', 10, NULL, 8),
    
    -- Règle 5: Amélioration Continue
    (p_tenant_id, 'Amélioration Continue', 'Amélioration de 5 points ou plus', 'GRADE_IMPROVEMENT', '{"min_improvement": 5}'::jsonb, 'POINTS', 25, NULL, 15),
    
    -- Règle 6: Assiduité Exemplaire
    (p_tenant_id, 'Assiduité Exemplaire', '30 jours de présence consécutifs', 'ATTENDANCE_STREAK', '{"consecutive_days": 30}'::jsonb, 'BADGE', NULL, v_badge_id, 25)
  ON CONFLICT DO NOTHING;

END;
$$ LANGUAGE plpgsql;
```

7. Cliquer sur **Run**

**Migration 3 : Correctif Onboarding (si nécessaire)**

```sql
-- Copier le contenu de : supabase/migrations/20260216220000_add_tenant_contact_fields.sql

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS country TEXT,
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'EUR',
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS email TEXT,
ADD COLUMN IF NOT EXISTS address TEXT;
```

8. Cliquer sur **Run**

**Option B : Via CLI Supabase**

```powershell
cd c:\Users\cheic\Documents\EduSchool\schoolflow-pro
supabase db push
```

### Étape 1.2 : Initialiser les Règles

Dans SQL Editor :

```sql
-- Remplacer 'VOTRE-TENANT-ID' par votre vrai tenant_id
SELECT seed_default_gamification_rules('VOTRE-TENANT-ID');
```

**Comment trouver votre tenant_id ?**

```sql
SELECT id, name, slug FROM tenants;
```

### Étape 1.3 : Déployer l'Edge Function

**Prérequis** : Installer Supabase CLI

```powershell
# Via npm
npm install -g supabase

# Ou via Scoop (Windows)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
```

**Déploiement** :

```powershell
cd c:\Users\cheic\Documents\EduSchool\schoolflow-pro

# Se connecter à Supabase
supabase login

# Lier le projet
supabase link --project-ref VOTRE-PROJECT-REF

# Déployer la fonction
supabase functions deploy process-gamification-event
```

**Vérification** :

```powershell
supabase functions list
```

Vous devriez voir `process-gamification-event` dans la liste.

### Étape 1.4 : Vérification du Déploiement

**Test SQL** :

```sql
-- Vérifier les règles
SELECT name, event_type, reward_type, is_active 
FROM gamification_rules 
WHERE tenant_id = 'VOTRE-TENANT-ID';

-- Résultat attendu : 6 règles
```

**Test Edge Function** :

```powershell
# Tester localement
supabase functions serve process-gamification-event

# Dans un autre terminal
curl -X POST http://localhost:54321/functions/v1/process-gamification-event \
  -H "Content-Type: application/json" \
  -d '{
    "event_type": "GRADE_ADDED",
    "event_id": "test-123",
    "tenant_id": "VOTRE-TENANT-ID",
    "student_id": "STUDENT-ID",
    "event_data": {"score": 18}
  }'
```

---

## 2. Intégration dans les Composants

### Étape 2.1 : Identifier les Points d'Intégration

Cherchons les composants où vous créez des notes, présences et devoirs :

**Notes** :
- Chercher : `insert.*grades` ou `createGrade`
- Fichiers potentiels : `GradeForm.tsx`, `GradeManager.tsx`, etc.

**Présences** :
- Chercher : `insert.*attendance` ou `markAttendance`
- Fichiers potentiels : `AttendanceForm.tsx`, `AttendanceManager.tsx`, etc.

**Devoirs** :
- Chercher : `insert.*assignment_submissions` ou `submitHomework`
- Fichiers potentiels : `HomeworkForm.tsx`, `AssignmentSubmission.tsx`, etc.

### Étape 2.2 : Intégrer les Triggers

**Exemple 1 : Intégration dans un composant de création de notes**

Supposons que vous ayez un composant `GradeForm.tsx` :

```typescript
import { onGradeAdded } from "@/lib/gamification-triggers";
import { useTenant } from "@/contexts/TenantContext";

export const GradeForm = () => {
  const { tenant } = useTenant();
  
  const createGradeMutation = useMutation({
    mutationFn: async (gradeData: GradeFormData) => {
      // 1. Créer la note
      const { data: grade, error } = await supabase
        .from("grades")
        .insert({
          tenant_id: tenant!.id,
          student_id: gradeData.student_id,
          subject_id: gradeData.subject_id,
          score: gradeData.score,
          // ... autres champs
        })
        .select()
        .single();

      if (error) throw error;

      // 2. Déclencher la gamification (non-bloquant)
      onGradeAdded(
        grade.id,
        tenant!.id,
        gradeData.student_id,
        gradeData.score,
        gradeData.subject_id
      ).catch((err) => {
        console.error("Gamification trigger failed:", err);
        // Ne pas bloquer l'opération principale
      });

      return grade;
    },
    onSuccess: () => {
      toast.success("Note ajoutée et points attribués !");
      queryClient.invalidateQueries({ queryKey: ["grades"] });
    },
  });

  // ... reste du composant
};
```

**Exemple 2 : Intégration dans un composant de présence**

```typescript
import { onAttendanceMarked } from "@/lib/gamification-triggers";

const markAttendanceMutation = useMutation({
  mutationFn: async (attendanceData: AttendanceData) => {
    const { data: attendance, error } = await supabase
      .from("attendance")
      .insert({
        tenant_id: tenant!.id,
        student_id: attendanceData.student_id,
        date: attendanceData.date,
        status: attendanceData.status,
      })
      .select()
      .single();

    if (error) throw error;

    // Déclencher uniquement si présent
    if (attendanceData.status === "PRESENT") {
      onAttendanceMarked(
        attendance.id,
        tenant!.id,
        attendanceData.student_id,
        attendanceData.status
      ).catch(console.error);
    }

    return attendance;
  },
});
```

### Étape 2.3 : Ajouter la Page de Test au Routing

Dans `src/App.tsx` ou votre fichier de routes :

```typescript
import { GamificationTest } from "@/pages/admin/GamificationTest";

// Dans vos routes admin
<Route path="/admin/gamification-test" element={<GamificationTest />} />
```

### Étape 2.4 : Ajouter un Lien dans le Menu Admin

Dans votre menu de navigation admin :

```typescript
{
  label: "Test Gamification",
  path: "/admin/gamification-test",
  icon: TestTube,
}
```

---

## 3. Personnalisation des Règles

### Étape 3.1 : Accéder à l'Interface de Gestion

1. Aller dans **Admin → Gamification**
2. Cliquer sur l'onglet **"Règles Auto"**
3. Vous verrez les 6 règles par défaut

### Étape 3.2 : Créer une Règle Personnalisée

**Exemple : Mention Très Bien**

1. Cliquer sur **"Nouvelle Règle"**
2. Remplir le formulaire :
   - **Nom** : `Mention Très Bien`
   - **Description** : `Note entre 16 et 17.99`
   - **Type d'événement** : `GRADE_ADDED`
   - **Conditions (JSON)** :
     ```json
     {
       "min_score": 16,
       "max_score": 17.99
     }
     ```
   - **Type de récompense** : `Points`
   - **Valeur** : `30`
   - **Priorité** : `12`
3. Cliquer sur **"Créer"**

**Exemple : Série de 10 Devoirs**

```json
{
  "consecutive_submissions": 10,
  "on_time": true
}
```

**Exemple : Amélioration Spectaculaire**

```json
{
  "min_improvement": 10
}
```

### Étape 3.3 : Règles Avancées par Matière

**Note excellente en Mathématiques** :

```json
{
  "min_score": 18,
  "subject_id": "UUID-DE-LA-MATIERE-MATHS"
}
```

### Étape 3.4 : Gérer les Règles

- **Activer/Désactiver** : Utiliser le switch à côté de chaque règle
- **Modifier la priorité** : Les règles avec priorité plus élevée sont évaluées en premier
- **Supprimer** : Cliquer sur l'icône de corbeille

---

## 4. Fonctionnalités Avancées

### 4.1 : Webhooks Automatiques (Production)

Pour une automatisation complète sans appel manuel des helpers :

**Créer un Trigger PostgreSQL** :

```sql
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
      'event_id', NEW.id,
      'tenant_id', NEW.tenant_id,
      'student_id', NEW.student_id,
      'event_data', jsonb_build_object('score', NEW.score, 'subject_id', NEW.subject_id)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_grade_added
  AFTER INSERT ON grades
  FOR EACH ROW
  EXECUTE FUNCTION trigger_gamification_on_grade();
```

### 4.2 : Analytics des Règles

**Créer une vue pour les statistiques** :

```sql
CREATE VIEW gamification_rule_stats AS
SELECT 
  gr.id,
  gr.name,
  gr.event_type,
  COUNT(DISTINCT gel.id) as times_triggered,
  COUNT(DISTINCT gel.student_id) as unique_students,
  SUM(CASE WHEN gr.reward_type = 'POINTS' THEN gr.reward_value ELSE 0 END) as total_points_awarded
FROM gamification_rules gr
LEFT JOIN gamification_event_log gel ON gel.rules_applied @> jsonb_build_array(jsonb_build_object('rule_id', gr.id))
GROUP BY gr.id, gr.name, gr.event_type;
```

### 4.3 : Notifications aux Étudiants

**Ajouter une notification lors de l'attribution** :

Dans `process-gamification-event/index.ts`, après l'attribution :

```typescript
// Créer une notification
await supabaseClient.from("notifications").insert({
  tenant_id,
  user_id: student_id,
  title: "🎉 Points gagnés !",
  message: `Vous avez gagné ${rule.reward_value} points grâce à "${rule.name}"`,
  type: "GAMIFICATION",
  is_read: false,
});
```

### 4.4 : Leaderboard en Temps Réel

**Créer une vue matérialisée** :

```sql
CREATE MATERIALIZED VIEW student_leaderboard AS
SELECT 
  s.id,
  s.first_name,
  s.last_name,
  s.tenant_id,
  COALESCE(SUM(pt.points), 0) as total_points,
  COUNT(DISTINCT ub.badge_definition_id) as badge_count,
  RANK() OVER (PARTITION BY s.tenant_id ORDER BY COALESCE(SUM(pt.points), 0) DESC) as rank
FROM students s
LEFT JOIN point_transactions pt ON pt.student_id = s.id
LEFT JOIN user_badges ub ON ub.user_id = s.id
GROUP BY s.id, s.first_name, s.last_name, s.tenant_id;

-- Rafraîchir toutes les heures
CREATE INDEX ON student_leaderboard(tenant_id, rank);
```

### 4.5 : Export des Données

**Fonction pour exporter l'historique** :

```sql
CREATE OR REPLACE FUNCTION export_gamification_history(p_tenant_id UUID, p_start_date DATE, p_end_date DATE)
RETURNS TABLE (
  student_name TEXT,
  event_type TEXT,
  event_date TIMESTAMPTZ,
  rules_triggered TEXT[],
  points_earned INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.first_name || ' ' || s.last_name as student_name,
    gel.event_type,
    gel.created_at as event_date,
    ARRAY_AGG(gr.name) as rules_triggered,
    SUM(gr.reward_value) as points_earned
  FROM gamification_event_log gel
  JOIN students s ON s.id = gel.student_id
  JOIN LATERAL jsonb_array_elements(gel.rules_applied) rl ON true
  JOIN gamification_rules gr ON gr.id = (rl->>'rule_id')::UUID
  WHERE gel.tenant_id = p_tenant_id
    AND gel.created_at BETWEEN p_start_date AND p_end_date
  GROUP BY s.first_name, s.last_name, gel.event_type, gel.created_at;
END;
$$ LANGUAGE plpgsql;
```

---

## ✅ Checklist Finale

- [ ] Migrations appliquées
- [ ] Règles par défaut initialisées
- [ ] Edge Function déployée
- [ ] Tests manuels réussis
- [ ] Triggers intégrés dans les composants
- [ ] Page de test accessible
- [ ] Règles personnalisées créées
- [ ] Documentation lue

---

## 🆘 Support

**Problèmes courants** :

1. **"Edge Function not found"** → Redéployer avec `supabase functions deploy`
2. **"No rules applied"** → Vérifier que les règles sont actives
3. **"Permission denied"** → Vérifier les RLS policies
4. **"Duplicate event"** → Normal, c'est la prévention des doublons

**Logs** :

```powershell
# Voir les logs de l'Edge Function
supabase functions logs process-gamification-event --tail
```

---

**Félicitations ! Votre système de gamification est maintenant opérationnel ! 🎉**
