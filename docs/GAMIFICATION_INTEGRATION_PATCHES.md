# Patches d'Intégration - Gamification

Ce fichier contient les modifications à apporter aux composants existants pour intégrer la gamification.

---

## 1. GradeForm.tsx - Intégration des Triggers de Gamification

**Fichier** : `src/features/grades/components/GradeForm.tsx`

### Modifications à apporter :

**1. Ajouter l'import** (ligne 27, après les autres imports) :

```typescript
import { onGradeAdded } from "@/lib/gamification-triggers";
import { useTenant } from "@/contexts/TenantContext";
```

**2. Ajouter le hook dans le composant** (ligne 58, après `useStudentLabel`) :

```typescript
const { tenant } = useTenant();
```

**3. Modifier la fonction `handleSubmit`** (remplacer les lignes 82-89) :

```typescript
const handleSubmit = async (data: z.infer<typeof gradeSchema>) => {
  try {
    // Appeler la fonction onSubmit fournie par le parent
    const createdGrade = await onSubmit(data);
    
    // Déclencher la gamification (non-bloquant)
    if (tenant && createdGrade?.id) {
      onGradeAdded(
        createdGrade.id,
        tenant.id,
        data.student_id,
        data.grade,
        data.subject_id
      ).catch((err) => {
        console.error("Gamification trigger failed:", err);
        // Ne pas bloquer l'opération principale
      });
    }
    
    form.reset();
  } catch (error) {
    console.error("Form submission error:", error);
  }
};
```

**Note** : Cette modification suppose que `onSubmit` retourne la note créée avec son `id`. Si ce n'est pas le cas, vous devrez modifier le parent qui appelle `GradeForm` pour qu'il retourne la note créée.

---

## 2. Modification du Parent de GradeForm

**Fichier** : Là où `GradeForm` est utilisé (probablement `GradeFormDialog.tsx` ou `GradeList.tsx`)

### Exemple d'intégration dans le parent :

```typescript
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { toast } from "sonner";

const createGradeMutation = useMutation({
  mutationFn: async (gradeData: GradeFormData) => {
    const { data: grade, error } = await supabase
      .from("grades")
      .insert({
        tenant_id: tenant!.id,
        student_id: gradeData.student_id,
        subject_id: gradeData.subject_id,
        grade: gradeData.grade,
        grading_scale: gradeData.grading_scale,
        academic_year_id: gradeData.academic_year_id,
        term_id: gradeData.term_id,
        comment: gradeData.comment,
      })
      .select()
      .single();

    if (error) throw error;
    
    // IMPORTANT : Retourner la note créée
    return grade;
  },
  onSuccess: () => {
    toast.success("Note ajoutée avec succès ! Points attribués automatiquement.");
    queryClient.invalidateQueries({ queryKey: ["grades"] });
  },
});

// Dans le JSX
<GradeForm
  onSubmit={createGradeMutation.mutateAsync} // Utiliser mutateAsync pour retourner la valeur
  isLoading={createGradeMutation.isPending}
  // ... autres props
/>
```

---

## 3. AttendanceCard.tsx - Intégration des Triggers

**Fichier** : `src/features/attendance/components/AttendanceCard.tsx`

### Modifications :

**1. Ajouter les imports** :

```typescript
import { onAttendanceMarked } from "@/lib/gamification-triggers";
import { useTenant } from "@/contexts/TenantContext";
```

**2. Dans le composant** :

```typescript
const { tenant } = useTenant();

const markAttendanceMutation = useMutation({
  mutationFn: async (attendanceData: { student_id: string; status: string; date: string }) => {
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

    // Déclencher la gamification uniquement si présent
    if (attendanceData.status === "PRESENT" && tenant) {
      onAttendanceMarked(
        attendance.id,
        tenant.id,
        attendanceData.student_id,
        attendanceData.status
      ).catch((err) => {
        console.error("Gamification trigger failed:", err);
      });
    }

    return attendance;
  },
  onSuccess: () => {
    toast.success("Présence enregistrée ! Points attribués.");
    queryClient.invalidateQueries({ queryKey: ["attendance"] });
  },
});
```

---

## 4. Ajout de la Route de Test

**Fichier** : `src/App.tsx` ou votre fichier de routes

### Ajouter :

```typescript
import { GamificationTest } from "@/pages/admin/GamificationTest";

// Dans vos routes admin
<Route path="/admin/gamification-test" element={<GamificationTest />} />
```

---

## 5. Ajout au Menu de Navigation

**Fichier** : Votre composant de navigation admin (ex: `Sidebar.tsx`, `AdminNav.tsx`)

### Ajouter :

```typescript
import { TestTube } from "lucide-react";

// Dans votre liste de liens
{
  label: "Test Gamification",
  path: "/admin/gamification-test",
  icon: TestTube,
  badge: "NEW",
}
```

---

## 6. Vérification de l'Onglet "Règles Auto"

**Fichier** : `src/pages/admin/Gamification.tsx`

### Vérifier que l'onglet existe (déjà modifié normalement) :

```typescript
import { GamificationRulesManager } from "@/components/gamification/GamificationRulesManager";

// Dans le TabsContent
<TabsContent value="rules">
  <GamificationRulesManager />
</TabsContent>
```

---

## Checklist d'Intégration

- [ ] `GradeForm.tsx` modifié avec les triggers
- [ ] Parent de `GradeForm` retourne la note créée
- [ ] `AttendanceCard.tsx` modifié avec les triggers
- [ ] Route `/admin/gamification-test` ajoutée
- [ ] Lien dans le menu de navigation
- [ ] Onglet "Règles Auto" vérifié dans `Gamification.tsx`
- [ ] Tests manuels effectués

---

## Test Rapide

Après avoir appliqué ces modifications :

1. **Créer une note ≥ 18** via le formulaire
2. **Vérifier dans la console** : Pas d'erreur
3. **Aller dans Admin → Gamification → Points Manager**
4. **Vérifier** : +50 points attribués à l'étudiant
5. **Aller dans `/admin/gamification-test`**
6. **Simuler un événement** et vérifier le résultat

---

## Support

Si vous rencontrez des problèmes :

1. Vérifier la console du navigateur
2. Vérifier que l'Edge Function est déployée
3. Vérifier que les règles sont actives
4. Consulter `GAMIFICATION_COMPLETE_SETUP.md` pour le dépannage
