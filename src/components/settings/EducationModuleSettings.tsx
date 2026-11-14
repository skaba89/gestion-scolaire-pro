import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useEducationCatalog, useEducationModules } from "@/hooks/useEducationModules";
import { toggleDraftModule, type EducationChoice, type EducationPreview } from "@/lib/education-modules";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

function errorMessage(error: unknown): string | undefined {
  const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  return typeof detail === "string" ? detail : undefined;
}

export function EducationModuleSettings() {
  const { t } = useTranslation();
  const { roles } = useAuth();
  const { tenant, switchTenant } = useTenant();
  const catalog = useEducationCatalog();
  const policy = useEducationModules();
  const queries = useQueryClient();
  const [profile, setProfile] = useState("");
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<EducationPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const manager = roles.some(role => role === "SUPER_ADMIN" || role === "TENANT_ADMIN");

  useEffect(() => {
    if (!policy.data) return;
    setProfile(policy.data.profile_id);
    setOverrides(policy.data.overrides);
    setPreview(null);
  }, [tenant?.id, policy.data]);

  const selected = useMemo(() => {
    const enabled = new Set(catalog.data?.profiles.find(p => p.id === profile)?.default_modules ?? []);
    for (const [id, active] of Object.entries(overrides)) {
      if (active) enabled.add(id); else enabled.delete(id);
    }
    return enabled;
  }, [catalog.data, profile, overrides]);

  if (!tenant) return null;
  if (catalog.isLoading || policy.isLoading) return <p role="status">{t("educationModules.loading")}</p>;
  if (!catalog.data || !policy.data || catalog.error || policy.error) return <div role="alert" className="space-y-3">
    <p>{t("educationModules.loadError")}</p>
    <Button onClick={() => { void catalog.refetch(); void policy.refetch(); }}>{t("educationModules.reload")}</Button>
  </div>;
  const data = catalog.data;
  const current = policy.data;
  const choice: EducationChoice = { profile_id: profile, overrides, expected_revision: current.revision };
  const moduleLabel = (id: string) => t(`educationModules.modules.${id}`, { defaultValue: data.modules.find(m => m.id === id)?.label ?? id });
  const changeModule = (id: string, active: boolean) => {
    const next = toggleDraftModule(data, selected, id, active);
    const defaults = new Set(data.profiles.find(p => p.id === profile)?.default_modules ?? []);
    setOverrides(Object.fromEntries(data.modules.filter(m => next.has(m.id) !== defaults.has(m.id)).map(m => [m.id, next.has(m.id)])));
    setPreview(null);
  };
  const showPreview = async () => {
    setBusy(true);
    try {
      const result = await apiClient.post<EducationPreview>("/education/preview/", choice);
      setPreview(result.data);
    } catch (error) {
      toast.error(errorMessage(error) ?? t("educationModules.saveError"));
    } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!preview) return;
    setBusy(true);
    try {
      await apiClient.put("/education/configuration/", choice);
      await queries.invalidateQueries({ queryKey: ["education-configuration"] });
      await switchTenant(tenant.id);
      setPreview(null);
      toast.success(t("educationModules.saved"));
    } catch (error) {
      toast.error(errorMessage(error) ?? t("educationModules.saveError"));
      await policy.refetch();
    } finally { setBusy(false); }
  };

  return <Card>
    <CardHeader>
      <CardTitle>{t("educationModules.title")}</CardTitle>
      <CardDescription>{t("educationModules.description")}</CardDescription>
    </CardHeader>
    <CardContent className="space-y-6">
      <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
        <p>{t(current.mode === "legacy" ? "educationModules.legacy" : "educationModules.configured", { revision: current.revision })}</p>
        <p>{t("educationModules.historyPreserved")}</p>
        <p>{t("educationModules.institutionScope")}</p>
      </div>
      {!manager && <p>{t("educationModules.readOnly")}</p>}
      <div className="max-w-xl space-y-2">
        <Label htmlFor="education-profile">{t("educationModules.profile")}</Label>
        <Select value={profile} disabled={!manager || busy} onValueChange={value => { setProfile(value); setOverrides({}); setPreview(null); }}>
          <SelectTrigger id="education-profile"><SelectValue /></SelectTrigger>
          <SelectContent>{data.profiles.map(p => <SelectItem key={p.id} value={p.id}>{t(`educationModules.profiles.${p.id}`)}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {data.modules.map(module => <div key={module.id} className="flex items-start gap-4 rounded-lg border p-4">
          <Switch id={`module-${module.id}`} aria-label={moduleLabel(module.id)} checked={selected.has(module.id)}
            disabled={!manager || busy || module.core || !module.available} onCheckedChange={active => changeModule(module.id, active)} />
          <div className="space-y-1">
            <Label htmlFor={`module-${module.id}`}>{moduleLabel(module.id)}</Label>
            <div className="flex flex-wrap gap-1">
              {module.core && <Badge variant="outline">{t("educationModules.core")}</Badge>}
              {!module.available && <Badge variant="outline">{t("educationModules.unavailable")}</Badge>}
              <span className="text-xs text-muted-foreground">{t(current.enabled_modules.includes(module.id) ? "educationModules.currentOn" : "educationModules.currentOff")}</span>
            </div>
            {module.dependencies.length > 0 && <p className="text-xs text-muted-foreground">{t("educationModules.dependencies", { modules: module.dependencies.map(moduleLabel).join(", ") })}</p>}
          </div>
        </div>)}
      </div>
      {manager && <Link className="text-sm underline" to={`/${tenant.slug}/admin/audit-logs`}>{t("nav.auditLogs")}</Link>}
      {manager && <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={busy} onClick={() => void showPreview()}>{t("educationModules.preview")}</Button>
        <Button disabled={busy || !preview} onClick={() => void apply()}>{t("educationModules.apply")}</Button>
      </div>}
      {preview && <div role="status" className="rounded-lg border p-4 space-y-2">
        <h3 className="font-semibold">{t("educationModules.previewTitle")}</h3>
        <p>{t("educationModules.added", { modules: preview.added.map(moduleLabel).join(", ") || t("educationModules.none") })}</p>
        <p>{t("educationModules.removed", { modules: preview.removed.map(moduleLabel).join(", ") || t("educationModules.none") })}</p>
        <p>{t("educationModules.historyPreserved")}</p>
      </div>}
    </CardContent>
  </Card>;
}
