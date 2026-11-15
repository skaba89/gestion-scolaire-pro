import { useEffect, useMemo, useState } from "react";
import { BookOpen, CalendarCheck, Edit, Loader2, Plus } from "lucide-react";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { hasPermission } from "@/lib/permissions";
import { useSemesters } from "@/queries/semesters";
import {
  LmdValidationRules, TeachingUnit, TeachingUnitInput, useCreateTeachingUnit,
  useLmdValidationRules, useTeachingUnits, useUpdateLmdValidationRules, useUpdateTeachingUnit,
} from "@/queries/teaching-units";
import {
  ExamSessionInput, useCreateExamSession, useExamSessions, useTransitionExamSession,
} from "@/queries/exam-sessions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";

const empty: TeachingUnitInput = { semester_id: "", code: "", name: "", ects: 0, is_active: true };
const defaultRules: LmdValidationRules = {
  intra_ue_compensation_enabled: false,
  semester_compensation_enabled: false,
  semester_pass_grade: 10,
  minimum_compensable_ue_grade: 5,
  require_all_ecues_graded: true,
};
const emptySession: ExamSessionInput = {
  semester_id: "", code: "", name: "", session_type: "REGULAR", sequence: 1,
  starts_on: "", ends_on: "", selection_policy: "BEST",
};

export default function TeachingUnits() {
  const { tenant } = useTenant();
  const { roles } = useAuth();
  const canEdit = hasPermission(roles, "subjects:manage");
  const canReadRules = hasPermission(roles, "settings:read");
  const canConfigureRules = hasPermission(roles, "settings:manage");
  const { data: units = [], isLoading } = useTeachingUnits(tenant?.id);
  const { data: examSessions = [] } = useExamSessions(tenant?.id, canReadRules);
  const { data: validation } = useLmdValidationRules(tenant?.id, canReadRules);
  const { data: semesters = [] } = useSemesters(tenant?.id);
  const create = useCreateTeachingUnit();
  const update = useUpdateTeachingUnit();
  const updateRules = useUpdateLmdValidationRules();
  const createSession = useCreateExamSession();
  const transitionSession = useTransitionExamSession();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<TeachingUnit | null>(null);
  const [form, setForm] = useState<TeachingUnitInput>(empty);
  const [rules, setRules] = useState<LmdValidationRules>(defaultRules);
  const [sessionOpen, setSessionOpen] = useState(false);
  const [sessionForm, setSessionForm] = useState<ExamSessionInput>(emptySession);
  const soleSemesterId = semesters.length === 1 ? semesters[0].id : "";

  useEffect(() => {
    if (!open) return;
    setForm(editing ? {
      semester_id: editing.semester_id, code: editing.code, name: editing.name,
      ects: editing.ects, is_active: editing.is_active,
    } : { ...empty, semester_id: soleSemesterId });
  }, [editing, open, soleSemesterId]);

  useEffect(() => {
    if (validation) setRules(validation.rules);
  }, [validation]);

  const semesterNames = useMemo(() => new Map(semesters.map(s => [s.id, s.name])), [semesters]);
  const submit = async () => {
    if (!form.semester_id || !form.code.trim() || !form.name.trim()) return;
    if (editing) await update.mutateAsync({ id: editing.id, expected_revision: editing.revision, ...form });
    else await create.mutateAsync(form);
    setOpen(false);
    setEditing(null);
  };
  const saveRules = () => {
    if (!validation || rules.minimum_compensable_ue_grade > rules.semester_pass_grade) return;
    updateRules.mutate({ expected_revision: validation.revision, rules });
  };
  const openSessionDialog = () => {
    setSessionForm({ ...emptySession, semester_id: soleSemesterId });
    setSessionOpen(true);
  };
  const saveSession = async () => {
    if (!sessionForm.semester_id || !sessionForm.code.trim() || !sessionForm.name.trim() ||
        !sessionForm.starts_on || !sessionForm.ends_on) return;
    await createSession.mutateAsync(sessionForm);
    setSessionOpen(false);
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

    {canReadRules && validation && <Card>
      <CardHeader><CardTitle className="text-lg">Règles de validation LMD</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <p className="text-sm text-muted-foreground">
          Le seuil ECUE effectif est {validation.effective_ecue_pass_grade}/20. Par défaut, chaque ECUE est capitalisé
          séparément. L'aperçu de validation ne modifie ni les notes ni les décisions historiques.
        </p>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <Label htmlFor="lmd-intra-ue">Compensation au sein de l'UE</Label>
            <Switch id="lmd-intra-ue" checked={rules.intra_ue_compensation_enabled}
              onCheckedChange={value => setRules({ ...rules, intra_ue_compensation_enabled: value })}
              disabled={!canConfigureRules} />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <Label htmlFor="lmd-semester">Compensation semestrielle</Label>
            <Switch id="lmd-semester" checked={rules.semester_compensation_enabled}
              onCheckedChange={value => setRules({ ...rules, semester_compensation_enabled: value })}
              disabled={!canConfigureRules} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lmd-semester-pass">Moyenne semestrielle minimale</Label>
            <Input id="lmd-semester-pass" type="number" min="0.01" max="20" step="0.01"
              value={rules.semester_pass_grade} disabled={!canConfigureRules}
              onChange={event => setRules({ ...rules, semester_pass_grade: Number(event.target.value) })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lmd-eliminatory-floor">Note éliminatoire par UE</Label>
            <Input id="lmd-eliminatory-floor" type="number" min="0" max="20" step="0.01"
              value={rules.minimum_compensable_ue_grade} disabled={!canConfigureRules}
              onChange={event => setRules({ ...rules, minimum_compensable_ue_grade: Number(event.target.value) })} />
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
          <div><Label htmlFor="lmd-complete">Exiger toutes les notes ECUE</Label>
            <p className="text-xs text-muted-foreground">Empêche toute compensation d'un semestre incomplet.</p></div>
          <Switch id="lmd-complete" checked={rules.require_all_ecues_graded}
            onCheckedChange={value => setRules({ ...rules, require_all_ecues_graded: value })}
            disabled={!canConfigureRules} />
        </div>
        {rules.minimum_compensable_ue_grade > rules.semester_pass_grade &&
          <p role="alert" className="text-sm text-destructive">La note éliminatoire ne peut pas dépasser la moyenne semestrielle.</p>}
        {canConfigureRules && <Button onClick={saveRules}
          disabled={updateRules.isPending || rules.minimum_compensable_ue_grade > rules.semester_pass_grade}>
          {updateRules.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Enregistrer les règles
        </Button>}
        {!canConfigureRules && <p className="text-sm text-muted-foreground">Consultation uniquement — modification réservée à l'administration.</p>}
      </CardContent>
    </Card>}

    {canReadRules && <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div><CardTitle className="text-lg">Sessions d'examen et rattrapages</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Seules les sessions clôturées influencent la validation LMD. Une clôture est définitive.
          </p></div>
        {canConfigureRules && <Button onClick={openSessionDialog} disabled={semesters.length === 0}>
          <Plus className="mr-2 h-4 w-4" /> Nouvelle session
        </Button>}
      </CardHeader>
      <CardContent className="space-y-3">
        {examSessions.map(session => <div key={session.id}
          className="flex flex-col justify-between gap-3 rounded-lg border p-3 sm:flex-row sm:items-center">
          <div className="flex gap-3"><CalendarCheck className="mt-0.5 h-4 w-4" /><div>
            <p className="font-medium">{session.code} — {session.name}</p>
            <p className="text-sm text-muted-foreground">
              {semesterNames.get(session.semester_id) || "Semestre inconnu"} ·
              {session.session_type === "RETAKE" ? " Rattrapage" : " Session normale"} ·
              {session.selection_policy === "BEST" ? " meilleure note" : " dernière tentative"} ·
              {session.assessment_count} évaluation(s)
            </p>
          </div></div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border px-2 py-1 text-xs">{session.status}</span>
            {canConfigureRules && session.status === "DRAFT" && <Button size="sm" variant="outline"
              onClick={() => transitionSession.mutate({ id: session.id, expected_revision: session.revision, status: "OPEN" })}>
              Ouvrir
            </Button>}
            {canConfigureRules && session.status === "OPEN" && <Button size="sm" variant="destructive"
              onClick={() => transitionSession.mutate({ id: session.id, expected_revision: session.revision, status: "CLOSED" })}>
              Clôturer
            </Button>}
          </div>
        </div>)}
        {examSessions.length === 0 && <p className="text-sm text-muted-foreground">Aucune session définie.</p>}
      </CardContent>
    </Card>}

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

    <Dialog open={sessionOpen} onOpenChange={setSessionOpen}>
      <DialogContent className="w-[calc(100%-2rem)] sm:max-w-lg">
        <DialogHeader><DialogTitle>Nouvelle session d'examen</DialogTitle>
          <DialogDescription>La session commence en brouillon et devra être ouverte puis clôturée.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label htmlFor="exam-session-semester">Semestre</Label>
            <Select value={sessionForm.semester_id}
              onValueChange={semester_id => setSessionForm({ ...sessionForm, semester_id })}>
              <SelectTrigger id="exam-session-semester"><SelectValue placeholder="Sélectionner" /></SelectTrigger>
              <SelectContent>{semesters.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="exam-session-code">Code</Label><Input id="exam-session-code"
              value={sessionForm.code} onChange={e => setSessionForm({ ...sessionForm, code: e.target.value })}
              placeholder="RATTRAPAGE-S1" /></div>
            <div className="space-y-2"><Label htmlFor="exam-session-name">Nom</Label><Input id="exam-session-name"
              value={sessionForm.name} onChange={e => setSessionForm({ ...sessionForm, name: e.target.value })}
              placeholder="Rattrapage semestre 1" /></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="exam-session-type">Type</Label><Select value={sessionForm.session_type}
              onValueChange={session_type => setSessionForm({ ...sessionForm, session_type: session_type as ExamSessionInput["session_type"] })}>
              <SelectTrigger id="exam-session-type"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="REGULAR">Session normale</SelectItem><SelectItem value="RETAKE">Rattrapage</SelectItem>
              </SelectContent></Select></div>
            <div className="space-y-2"><Label htmlFor="exam-session-policy">Règle de sélection</Label><Select value={sessionForm.selection_policy}
              onValueChange={selection_policy => setSessionForm({ ...sessionForm, selection_policy: selection_policy as ExamSessionInput["selection_policy"] })}>
              <SelectTrigger id="exam-session-policy"><SelectValue /></SelectTrigger><SelectContent>
                <SelectItem value="BEST">Meilleure note</SelectItem><SelectItem value="LATEST">Dernière tentative</SelectItem>
              </SelectContent></Select></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label htmlFor="exam-session-sequence">Ordre</Label><Input id="exam-session-sequence"
              type="number" min="1" value={sessionForm.sequence}
              onChange={e => setSessionForm({ ...sessionForm, sequence: Number(e.target.value) })} /></div>
            <div className="space-y-2"><Label htmlFor="exam-session-start">Début</Label><Input id="exam-session-start"
              type="date" value={sessionForm.starts_on}
              onChange={e => setSessionForm({ ...sessionForm, starts_on: e.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="exam-session-end">Fin</Label><Input id="exam-session-end"
              type="date" value={sessionForm.ends_on}
              onChange={e => setSessionForm({ ...sessionForm, ends_on: e.target.value })} /></div>
          </div>
          {sessionForm.starts_on && sessionForm.ends_on && sessionForm.ends_on < sessionForm.starts_on &&
            <p role="alert" className="text-sm text-destructive">La fin doit suivre le début.</p>}
          <Button className="w-full" onClick={saveSession} disabled={createSession.isPending || !sessionForm.semester_id ||
            !sessionForm.code.trim() || !sessionForm.name.trim() || !sessionForm.starts_on || !sessionForm.ends_on ||
            sessionForm.ends_on < sessionForm.starts_on}>
            {createSession.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Créer la session
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>;
}
