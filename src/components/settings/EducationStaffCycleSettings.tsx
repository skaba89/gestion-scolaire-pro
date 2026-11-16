import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type CycleOption = { id: string; name: string; code: string; is_active: boolean };

export type StaffCycleItem = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string;
  is_active: boolean;
  roles: string[];
  restrictable: boolean;
  cycle_ids: string[];
};

type StaffCycleList = {
  items: StaffCycleItem[];
  total: number;
  cycle_policy_available: boolean;
};

function errorMessage(error: unknown): string | undefined {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" ? detail : undefined;
}

const sameSet = (left: string[], right: string[]) =>
  left.length === right.length && left.every(value => right.includes(value));

/**
 * Restriction (opt-in) of administrative staff to some cycles of a mixed
 * institution. An empty selection keeps the account unrestricted. Recording
 * a restriction does not yet filter data: the page says so explicitly while
 * `cycle_policy_available` is false.
 */
export function EducationStaffCycleSettings() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const manager = roles.some(role => role === "SUPER_ADMIN" || role === "TENANT_ADMIN");
  const staff = useQuery<StaffCycleList>({
    queryKey: ["education-staff-cycles", tenant?.id],
    queryFn: () => apiClient.get("/education/staff-cycles/", { params: { limit: 500 } }).then(response => response.data),
    enabled: !!tenant?.id && manager,
  });
  const cycles = useQuery<CycleOption[]>({
    queryKey: ["education-cycles", tenant?.id],
    queryFn: () => apiClient.get("/education/cycles/").then(response => response.data),
    enabled: !!tenant?.id && manager,
  });
  const [drafts, setDrafts] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!staff.data) return;
    setDrafts(Object.fromEntries(staff.data.items.map(item => [item.user_id, item.cycle_ids])));
  }, [staff.data]);

  if (!tenant || !manager) return null;
  if (staff.isLoading || cycles.isLoading) {
    return <p role="status">{t("educationCycles.staff.loading", { defaultValue: "Chargement du personnel…" })}</p>;
  }
  if (staff.error || cycles.error || !staff.data || !cycles.data) {
    return <div role="alert" className="space-y-3">
      <p>{t("educationCycles.staff.loadError", { defaultValue: "Les affectations du personnel ne peuvent pas être chargées." })}</p>
      <Button onClick={() => { void staff.refetch(); void cycles.refetch(); }}>{t("educationModules.reload")}</Button>
    </div>;
  }

  const cycleName = Object.fromEntries(cycles.data.map(cycle => [cycle.id, cycle.name]));
  const save = async (item: StaffCycleItem) => {
    setBusy(item.user_id);
    try {
      await apiClient.put(`/education/staff-cycles/${item.user_id}/`, {
        expected_cycle_ids: item.cycle_ids,
        cycle_ids: drafts[item.user_id] ?? [],
      });
      await queryClient.invalidateQueries({ queryKey: ["education-staff-cycles", tenant.id] });
      toast.success(t("educationCycles.staff.saved", { defaultValue: "Affectation enregistrée. La personne devra se reconnecter." }));
    } catch (error) {
      toast.error(errorMessage(error) ?? t("educationCycles.staff.saveError", { defaultValue: "L’affectation n’a pas pu être enregistrée." }));
      await staff.refetch();
    } finally { setBusy(null); }
  };

  return <Card>
    <CardHeader>
      <CardTitle>{t("educationCycles.staff.title", { defaultValue: "Personnel par cycle" })}</CardTitle>
      <CardDescription>{t("educationCycles.staff.description", { defaultValue: "Limitez un directeur, un secrétariat ou la comptabilité à certains cycles. Sans cycle coché, la personne garde l’accès à tout l’établissement." })}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      {!staff.data.cycle_policy_available && <p className="rounded-lg border bg-muted/30 p-4 text-sm">
        {t("educationCycles.staff.notEnforced", { defaultValue: "Les affectations sont enregistrées mais ne filtrent pas encore les données : le contrôle d’accès par cycle sera activé dans une prochaine version." })}
      </p>}
      {cycles.data.length === 0 && <p className="text-muted-foreground">{t("educationCycles.empty", { defaultValue: "Aucun cycle défini. Les niveaux existants restent inchangés." })}</p>}
      {staff.data.items.length === 0 ? <p className="text-muted-foreground">{t("educationCycles.staff.empty", { defaultValue: "Aucun membre du personnel concerné." })}</p> :
        <ul className="space-y-3">{staff.data.items.map(item => {
          const selected = drafts[item.user_id] ?? [];
          const name = [item.first_name, item.last_name].filter(Boolean).join(" ") || item.email;
          const options = cycles.data.filter(cycle => cycle.is_active || item.cycle_ids.includes(cycle.id));
          return <li key={item.user_id} className="rounded-lg border p-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{name}</span>
              {item.roles.map(role => <Badge key={role} variant="secondary">{t(`educationCycles.staff.roles.${role}`, { defaultValue: role })}</Badge>)}
              <Badge variant={item.cycle_ids.length ? "default" : "outline"}>
                {item.cycle_ids.length
                  ? item.cycle_ids.map(id => cycleName[id] ?? id).join(", ")
                  : t("educationCycles.staff.allCycles", { defaultValue: "Tous les cycles" })}
              </Badge>
            </div>
            {!item.restrictable && <p className="text-sm text-muted-foreground">{t("educationCycles.staff.notRestrictable", { defaultValue: "Ce compte ne peut pas être limité à des cycles ; vous pouvez seulement retirer ses affectations." })}</p>}
            <div className="flex flex-wrap gap-3">{options.map(cycle => {
              const id = `${item.user_id}-${cycle.id}`;
              const checked = selected.includes(cycle.id);
              const locked = !item.restrictable && !checked;
              return <div key={cycle.id} className="flex items-center gap-2">
                <Checkbox id={id} checked={checked} disabled={busy !== null || locked || (!cycle.is_active && !checked)}
                  onCheckedChange={value => setDrafts(current => ({
                    ...current,
                    [item.user_id]: value ? [...(current[item.user_id] ?? []), cycle.id] : (current[item.user_id] ?? []).filter(other => other !== cycle.id),
                  }))} />
                <Label htmlFor={id}>{cycle.name}{cycle.is_active ? "" : ` — ${t("educationCycles.archived", { defaultValue: "Archivé" })}`}</Label>
              </div>;
            })}</div>
            <Button size="sm" disabled={busy !== null || sameSet(selected, item.cycle_ids)} onClick={() => void save(item)}>
              {t("educationCycles.staff.save", { defaultValue: "Enregistrer" })}
            </Button>
          </li>;
        })}</ul>}
      {staff.data.total > staff.data.items.length && <p className="text-sm text-muted-foreground">
        {t("educationCycles.staff.truncated", { defaultValue: "Liste limitée aux {{count}} premiers comptes.", count: staff.data.items.length })}
      </p>}
    </CardContent>
  </Card>;
}
