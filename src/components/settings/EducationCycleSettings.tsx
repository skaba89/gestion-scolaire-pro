import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useEducationCatalog } from "@/hooks/useEducationModules";
import type { Level } from "@/queries/levels";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

type EducationCycle = {
  id: string;
  code: string;
  name: string;
  institution_type: string;
  period_type: "TRIMESTER" | "SEMESTER" | "CUSTOM";
  order_index: number;
  is_active: boolean;
  revision: number;
  level_ids: string[];
  cycle_policy_available: false;
};

function errorMessage(error: unknown): string | undefined {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" ? detail : undefined;
}

export function EducationCycleSettings() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const { tenant } = useTenant();
  const catalog = useEducationCatalog();
  const queryClient = useQueryClient();
  const manager = roles.some(role => role === "SUPER_ADMIN" || role === "TENANT_ADMIN");
  const cycles = useQuery<EducationCycle[]>({
    queryKey: ["education-cycles", tenant?.id],
    queryFn: () => apiClient.get("/education/cycles/").then(response => response.data),
    enabled: !!tenant?.id,
  });
  const levels = useQuery<Level[]>({
    queryKey: ["levels", tenant?.id],
    queryFn: () => apiClient.get("/levels/").then(response => response.data),
    enabled: !!tenant?.id,
  });
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [profile, setProfile] = useState("primary");
  const [period, setPeriod] = useState<EducationCycle["period_type"]>("TRIMESTER");

  useEffect(() => {
    if (!cycles.data) return;
    setDrafts(Object.fromEntries(cycles.data.map(cycle => [cycle.id, cycle.level_ids])));
  }, [cycles.data]);

  const ownerByLevel = useMemo(() => Object.fromEntries(
    (cycles.data ?? []).flatMap(cycle => cycle.level_ids.map(levelId => [levelId, cycle.id])),
  ), [cycles.data]);

  if (!tenant) return null;
  if (cycles.isLoading || levels.isLoading || catalog.isLoading) {
    return <p role="status">{t("educationCycles.loading", { defaultValue: "Chargement des cycles…" })}</p>;
  }
  if (cycles.error || levels.error || catalog.error || !catalog.data) {
    return <div role="alert" className="space-y-3">
      <p>{t("educationCycles.loadError", { defaultValue: "Les cycles ne peuvent pas être chargés." })}</p>
      <Button onClick={() => { void cycles.refetch(); void levels.refetch(); void catalog.refetch(); }}>
        {t("educationModules.reload")}
      </Button>
    </div>;
  }

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["education-cycles", tenant.id] }),
      queryClient.invalidateQueries({ queryKey: ["levels", tenant.id] }),
    ]);
  };
  const create = async () => {
    setBusy("create");
    try {
      await apiClient.post("/education/cycles/", {
        code, name, institution_type: profile, period_type: period,
        order_index: (cycles.data?.length ?? 0) + 1,
      });
      setCode("");
      setName("");
      await refresh();
      toast.success(t("educationCycles.created", { defaultValue: "Cycle créé." }));
    } catch (error) {
      toast.error(errorMessage(error) ?? t("educationCycles.saveError", { defaultValue: "Le cycle n’a pas pu être enregistré." }));
    } finally { setBusy(null); }
  };
  const assign = async (cycle: EducationCycle) => {
    setBusy(cycle.id);
    try {
      await apiClient.put(`/education/cycles/${cycle.id}/levels/`, {
        expected_revision: cycle.revision,
        level_ids: drafts[cycle.id] ?? [],
      });
      await refresh();
      toast.success(t("educationCycles.assigned", { defaultValue: "Niveaux affectés." }));
    } catch (error) {
      toast.error(errorMessage(error) ?? t("educationCycles.saveError", { defaultValue: "Le cycle n’a pas pu être enregistré." }));
      await cycles.refetch();
    } finally { setBusy(null); }
  };
  const toggleActive = async (cycle: EducationCycle) => {
    setBusy(cycle.id);
    try {
      await apiClient.patch(`/education/cycles/${cycle.id}/`, {
        expected_revision: cycle.revision,
        is_active: !cycle.is_active,
      });
      await refresh();
      toast.success(t("educationCycles.statusSaved", { defaultValue: "Statut du cycle enregistré." }));
    } catch (error) {
      toast.error(errorMessage(error) ?? t("educationCycles.saveError", { defaultValue: "Le cycle n’a pas pu être enregistré." }));
      await cycles.refetch();
    } finally { setBusy(null); }
  };

  return <div className="space-y-6">
    <Card>
      <CardHeader>
        <CardTitle>{t("educationCycles.title", { defaultValue: "Cycles pédagogiques" })}</CardTitle>
        <CardDescription>{t("educationCycles.description", { defaultValue: "Regroupez les niveaux d’un établissement mixte sans dupliquer ses comptes ni ses données administratives." })}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-1">
          <p>{t("educationCycles.historyPreserved", { defaultValue: "L’archivage conserve niveaux, classes, inscriptions, notes et historiques." })}</p>
          <p>{t("educationCycles.policyPending", { defaultValue: "Les permissions différentes par cycle ne sont pas encore activées." })}</p>
        </div>
        {!manager && <p>{t("educationModules.readOnly")}</p>}
        {manager && <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2"><Label htmlFor="cycle-code">{t("educationCycles.code", { defaultValue: "Code" })}</Label><Input id="cycle-code" value={code} maxLength={50} onChange={event => setCode(event.target.value.toUpperCase())} /></div>
          <div className="space-y-2"><Label htmlFor="cycle-name">{t("educationCycles.name", { defaultValue: "Nom" })}</Label><Input id="cycle-name" value={name} maxLength={255} onChange={event => setName(event.target.value)} /></div>
          <div className="space-y-2"><Label>{t("educationCycles.profile", { defaultValue: "Type de cycle" })}</Label><Select value={profile} onValueChange={value => {
            setProfile(value);
            const suggested = catalog.data?.profiles.find(item => item.id === value)?.period_type;
            if (suggested && suggested !== "PER_CYCLE") setPeriod(suggested as EducationCycle["period_type"]);
          }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{catalog.data.profiles.filter(item => item.id !== "mixed").map(item => <SelectItem key={item.id} value={item.id}>{t(`educationModules.profiles.${item.id}`)}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-2"><Label>{t("educationCycles.period", { defaultValue: "Périodicité" })}</Label><Select value={period} onValueChange={value => setPeriod(value as EducationCycle["period_type"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["TRIMESTER", "SEMESTER", "CUSTOM"].map(value => <SelectItem key={value} value={value}>{t(`educationCycles.periods.${value}`, { defaultValue: value })}</SelectItem>)}</SelectContent></Select></div>
          <Button className="md:col-span-2 lg:col-span-4" disabled={!code.trim() || !name.trim() || busy !== null} onClick={() => void create()}>{t("educationCycles.create", { defaultValue: "Créer le cycle" })}</Button>
        </div>}
      </CardContent>
    </Card>

    {(cycles.data ?? []).length === 0 ? <Card><CardContent className="p-6 text-muted-foreground">{t("educationCycles.empty", { defaultValue: "Aucun cycle défini. Les niveaux existants restent inchangés." })}</CardContent></Card> :
      <div className="grid gap-4 lg:grid-cols-2">{cycles.data?.map(cycle => <Card key={cycle.id}>
        <CardHeader>
          <div className="flex items-start justify-between gap-3"><div><CardTitle>{cycle.name}</CardTitle><CardDescription>{cycle.code} · {t(`educationModules.profiles.${cycle.institution_type}`)} · {t(`educationCycles.periods.${cycle.period_type}`, { defaultValue: cycle.period_type })}</CardDescription></div><Badge variant={cycle.is_active ? "default" : "outline"}>{cycle.is_active ? t("educationCycles.active", { defaultValue: "Actif" }) : t("educationCycles.archived", { defaultValue: "Archivé" })}</Badge></div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">{(levels.data ?? []).map(level => {
            const owner = ownerByLevel[level.id];
            const checked = (drafts[cycle.id] ?? []).includes(level.id);
            const unavailable = !!owner && owner !== cycle.id;
            return <div key={level.id} className="flex items-center gap-3 rounded border p-3"><Checkbox id={`${cycle.id}-${level.id}`} checked={checked} disabled={!manager || !cycle.is_active || unavailable || busy !== null} onCheckedChange={value => setDrafts(current => ({ ...current, [cycle.id]: value ? [...(current[cycle.id] ?? []), level.id] : (current[cycle.id] ?? []).filter(id => id !== level.id) }))} /><Label htmlFor={`${cycle.id}-${level.id}`} className={unavailable ? "text-muted-foreground" : ""}>{level.name}{unavailable ? ` — ${t("educationCycles.otherCycle", { defaultValue: "autre cycle" })}` : ""}</Label></div>;
          })}</div>
          {manager && <div className="flex flex-wrap gap-3"><Button disabled={!cycle.is_active || busy !== null} onClick={() => void assign(cycle)}>{t("educationCycles.saveLevels", { defaultValue: "Enregistrer les niveaux" })}</Button><Button variant="outline" disabled={busy !== null} onClick={() => void toggleActive(cycle)}>{cycle.is_active ? t("educationCycles.archive", { defaultValue: "Archiver" }) : t("educationCycles.reactivate", { defaultValue: "Réactiver" })}</Button></div>}
        </CardContent>
      </Card>)}</div>}
    {manager && <Link className="text-sm underline" to={`/${tenant.slug}/admin/audit-logs`}>{t("nav.auditLogs")}</Link>}
  </div>;
}
