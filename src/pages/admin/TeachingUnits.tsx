import { useEffect, useMemo, useState } from "react";
import { BookOpen, Edit, Loader2, Plus } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/permissions";
import { useSemesters } from "@/queries/semesters";
import { TeachingUnit, TeachingUnitInput, useCreateTeachingUnit, useTeachingUnits, useUpdateTeachingUnit } from "@/queries/teaching-units";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const empty: TeachingUnitInput = { semester_id: "", code: "", name: "", ects: 0, is_active: true };

export default function TeachingUnits() {
  const { tenant } = useTenant();
  const { roles } = useAuth();
  const canEdit = hasPermission(roles, "subjects:manage");
  const { data: units = [], isLoading } = useTeachingUnits(tenant?.id);
  const { data: semesters = [] } = useSemesters(tenant?.id);
  const create = useCreateTeachingUnit();
  const update = useUpdateTeachingUnit();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeachingUnit | null>(null);
  const [form, setForm] = useState<TeachingUnitInput>(empty);
  const soleSemesterId = semesters.length === 1 ? semesters[0].id : "";

  useEffect(() => {
    if (!open) return;
    setForm(editing ? {
      semester_id: editing.semester_id, code: editing.code, name: editing.name,
      ects: editing.ects, is_active: editing.is_active,
    } : { ...empty, semester_id: soleSemesterId });
  }, [editing, open, soleSemesterId]);

  const semesterNames = useMemo(() => new Map(semesters.map(s => [s.id, s.name])), [semesters]);
  const submit = async () => {
    if (!form.semester_id || !form.code.trim() || !form.name.trim()) return;
    if (editing) await update.mutateAsync({ id: editing.id, expected_revision: editing.revision, ...form });
    else await create.mutateAsync(form);
    setOpen(false);
    setEditing(null);
  };

  if (isLoading) return <div className="flex justify-center p-10"><Loader2 className="h-8 w-8 animate-spin" /></div>;

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-display font-bold">Unités d'enseignement (UE)</h1>
        <p className="text-muted-foreground">Regroupez les matières en ECUE et contrôlez la cohérence des crédits LMD.</p>
      </div>
      {canEdit && <Button onClick={() => { setEditing(null); setOpen(true); }} disabled={semesters.length === 0}>
        <Plus className="mr-2 h-4 w-4" /> Nouvelle UE
      </Button>}
    </div>

    {semesters.length === 0 && <Card><CardContent className="py-6 text-sm text-muted-foreground">
      Créez d'abord un semestre avant de définir une unité d'enseignement.
    </CardContent></Card>}

    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {units.map(unit => <Card key={unit.id} className={!unit.is_active ? "opacity-70" : ""}>
        <CardHeader className="pb-3"><CardTitle className="flex items-start justify-between gap-2 text-base">
          <span className="flex gap-2"><BookOpen className="mt-0.5 h-4 w-4" /><span>{unit.code} — {unit.name}</span></span>
          {canEdit && <Button variant="ghost" size="icon" aria-label={`Modifier ${unit.code}`} onClick={() => { setEditing(unit); setOpen(true); }}><Edit className="h-4 w-4" /></Button>}
        </CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>{semesterNames.get(unit.semester_id) || "Semestre inconnu"} · {unit.ects} ECTS</p>
          <p>{unit.subject_count} ECUE · {unit.assigned_ects} ECTS affectés</p>
          <p className={unit.ects_consistent ? "text-green-700" : "text-amber-700"}>
            {unit.ects_consistent ? "Crédits cohérents" : "Crédits à équilibrer"}
          </p>
          {!unit.is_active && <p className="text-muted-foreground">Archivée — historique conservé</p>}
        </CardContent>
      </Card>)}
      {units.length === 0 && semesters.length > 0 && <p className="text-muted-foreground">Aucune UE créée.</p>}
    </div>

    <Dialog open={open} onOpenChange={(value) => { setOpen(value); if (!value) setEditing(null); }}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg">
        <DialogHeader><DialogTitle>{editing ? "Modifier l'UE" : "Nouvelle UE"}</DialogTitle>
          <DialogDescription>L'archivage conserve les ECUE, notes et historiques déjà rattachés.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="teaching-unit-semester">Semestre</Label><Select value={form.semester_id} onValueChange={semester_id => setForm({ ...form, semester_id })}>
            <SelectTrigger id="teaching-unit-semester" aria-label="Semestre"><SelectValue placeholder="Sélectionner" /></SelectTrigger><SelectContent>{semesters.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="teaching-unit-code">Code</Label><Input id="teaching-unit-code" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} placeholder="UE-INF-01" /></div>
            <div className="space-y-2"><Label htmlFor="teaching-unit-ects">Crédits ECTS</Label><Input id="teaching-unit-ects" type="number" min="0" step="0.5" value={form.ects} onChange={e => setForm({ ...form, ects: Number(e.target.value) })} /></div>
          </div>
          <div className="space-y-2"><Label htmlFor="teaching-unit-name">Nom</Label><Input id="teaching-unit-name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Informatique fondamentale" /></div>
          <div className="flex items-center gap-2"><Switch id="teaching-unit-active" checked={form.is_active} onCheckedChange={is_active => setForm({ ...form, is_active })} /><Label htmlFor="teaching-unit-active">UE active</Label></div>
          <Button className="w-full" onClick={submit} disabled={!form.semester_id || !form.code.trim() || !form.name.trim() || create.isPending || update.isPending}>
            {(create.isPending || update.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editing ? "Enregistrer" : "Créer"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}
