import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { AlertCircle, Info, Loader2, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { useTerminology } from "@/hooks/useTerminology";
import {
  type AcademicRules as Rules,
  type AcademicRulesResponse,
  MENTION_LABELS,
  cloneRules,
  firstRuleProblem,
  mentionBands,
} from "@/features/academic/academicRules";

const URL = "/tenants/settings/academic-rules/";

/**
 * Règles académiques de l'établissement : moyenne de passage et seuils de
 * mention, appliqués par les bulletins et les relevés. Avant le 2026-11-04,
 * cette page appelait des routes inexistantes et demandait du JSON à saisir.
 */
function RulesEditor({ rules, onChange, idPrefix }: { rules: Rules; onChange: (r: Rules) => void; idPrefix: string }) {
  const { t } = useTranslation();
  const problem = firstRuleProblem(rules);
  const setMention = (label: string, value: number) =>
    onChange({ ...rules, mentions: rules.mentions.map((m) => (m.label === label ? { ...m, min: value } : m)) });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-1">
          <Label htmlFor={`${idPrefix}-passing`}>{t("academicRules.passingGrade")}</Label>
          <Input id={`${idPrefix}-passing`} type="number" inputMode="decimal" min={0} max={20} step={0.25}
            value={rules.passing_grade}
            onChange={(e) => onChange({ ...rules, passing_grade: Number(e.target.value) })} />
        </div>
        {MENTION_LABELS.map((label) => (
          <div className="space-y-1" key={label}>
            <Label htmlFor={`${idPrefix}-${label}`}>{t("academicRules.mentionFrom", { label })}</Label>
            <Input id={`${idPrefix}-${label}`} type="number" inputMode="decimal" min={0} max={20} step={0.25}
              value={rules.mentions.find((m) => m.label === label)?.min ?? ""}
              onChange={(e) => setMention(label, Number(e.target.value))} />
          </div>
        ))}
      </div>
      {problem ? (
        <p className="text-sm text-destructive" role="alert">{t(problem.key, problem.values)}</p>
      ) : (
        <ul className="flex flex-wrap gap-2 text-xs" aria-label={t("academicRules.preview")}>
          {mentionBands(rules).map((b) => (
            <li key={b.label} className="rounded-full bg-muted px-3 py-1">
              <span className="font-medium">{b.label}</span>{" "}
              {b.from === null ? `< ${b.to}` : b.to === null ? `≥ ${b.from}` : `${b.from} – ${b.to}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function AcademicRules() {
  const { t } = useTranslation();
  const { levelLabel } = useTerminology();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["academic-rules"],
    queryFn: async () => (await apiClient.get<AcademicRulesResponse>(URL)).data,
  });

  const [schoolRules, setSchoolRules] = useState<Rules | null>(null);
  const [levelRules, setLevelRules] = useState<Record<string, Rules>>({});
  const [levelToAdd, setLevelToAdd] = useState<string>("");

  useEffect(() => {
    if (!data) return;
    setSchoolRules(cloneRules(data.default ?? data.defaults));
    setLevelRules(Object.fromEntries(data.levels.map((l) => [l.level_id, cloneRules(l.rules)])));
  }, [data]);

  const save = useMutation({
    mutationFn: async () => {
      const isDefault = JSON.stringify(schoolRules) === JSON.stringify(data?.defaults);
      const { data: saved } = await apiClient.put<AcademicRulesResponse>(URL, {
        default: isDefault ? null : schoolRules,
        levels: levelRules,
      });
      return saved;
    },
    onSuccess: (saved) => {
      queryClient.setQueryData(["academic-rules"], saved);
      toast.success(t("academicRules.saved"));
    },
    onError: (error: unknown) => {
      const detail = (error as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : t("academicRules.saveError"));
    },
  });

  if (isLoading || (!schoolRules && !isError)) {
    return (
      <div className="py-10 text-center" role="status">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (isError || !data || !schoolRules) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>{t("academicRules.loadErrorTitle")}</AlertTitle>
        <AlertDescription>{t("academicRules.loadErrorDescription")}</AlertDescription>
      </Alert>
    );
  }

  const levelName = (id: string) => data.available_levels.find((l) => l.id === id)?.name ?? id;
  const addable = data.available_levels.filter((l) => !levelRules[l.id]);
  const hasProblem = !!firstRuleProblem(schoolRules) || Object.values(levelRules).some((r) => !!firstRuleProblem(r));

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t("academicRules.pageTitle")}</h2>
          <p className="text-muted-foreground">{t("academicRules.pageSubtitleApplied")}</p>
        </div>
        <Button onClick={() => save.mutate()} disabled={save.isPending || hasProblem}>
          {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {t("academicRules.save")}
        </Button>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>{t("academicRules.whereAppliedTitle")}</AlertTitle>
        <AlertDescription>{t("academicRules.whereAppliedDescription")}</AlertDescription>
      </Alert>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
          <div>
            <CardTitle>{t("academicRules.schoolRulesTitle")}</CardTitle>
            <CardDescription>{t("academicRules.schoolRulesDescription")}</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => setSchoolRules(cloneRules(data.defaults))}>
            <RotateCcw className="mr-2 h-4 w-4" />
            {t("academicRules.resetDefaults")}
          </Button>
        </CardHeader>
        <CardContent>
          <RulesEditor rules={schoolRules} onChange={setSchoolRules} idPrefix="school" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("academicRules.levelRulesTitle", { label: levelLabel })}</CardTitle>
          <CardDescription>{t("academicRules.levelRulesDescription", { label: levelLabel })}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {Object.keys(levelRules).length === 0 && (
            <p className="text-sm text-muted-foreground">{t("academicRules.noLevelRules")}</p>
          )}
          {Object.entries(levelRules).map(([id, rules]) => (
            <div key={id} className="space-y-3 rounded-lg border p-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{levelName(id)}</h3>
                <Button variant="ghost" size="sm" className="text-destructive"
                  aria-label={t("academicRules.removeLevelRules", { name: levelName(id) })}
                  onClick={() => setLevelRules(Object.fromEntries(Object.entries(levelRules).filter(([k]) => k !== id)))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <RulesEditor rules={rules} idPrefix={`level-${id}`}
                onChange={(r) => setLevelRules({ ...levelRules, [id]: r })} />
            </div>
          ))}
          {addable.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="space-y-1 sm:w-64">
                <Label>{levelLabel}</Label>
                <Select value={levelToAdd} onValueChange={setLevelToAdd}>
                  <SelectTrigger><SelectValue placeholder={t("academicRules.chooseLevel")} /></SelectTrigger>
                  <SelectContent>
                    {addable.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button variant="outline" disabled={!levelToAdd}
                onClick={() => { setLevelRules({ ...levelRules, [levelToAdd]: cloneRules(schoolRules) }); setLevelToAdd(""); }}>
                <Plus className="mr-2 h-4 w-4" />
                {t("academicRules.addLevelRules")}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
