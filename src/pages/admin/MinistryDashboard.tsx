/**
 * MinistryDashboard — Reporting Institutionnel + Conformité MEN Guinée
 *
 * Deux onglets :
 *  1. "Reporting" — KPIs, effectifs par niveau, données financières (existant)
 *  2. "Conformité MEN" — Champs officiels requis par le Ministère de l'Éducation
 *     Nationale de Guinée, score de complétude, rapport imprimable
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { adminQueries } from "@/queries/admin";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Users, TrendingUp, GraduationCap, Calendar, RefreshCcw, BarChart3,
  PieChart as PieChartIcon, Download, ShieldCheck, FileSpreadsheet,
  BookOpen, CheckCircle2, AlertCircle, Printer, Save, ClipboardList,
  Building2, MapPin, FileText,
} from "lucide-react";
import { toastService } from "@/utils/toast";
import { useCurrency } from "@/hooks/useCurrency";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  Tooltip as RechartsTooltip, Legend,
} from "recharts";
import { TooltipTour } from "@/components/onboarding/OnboardingTour";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { cn } from "@/lib/utils";

// ── Types ──────────────────────────────────────────────────────────────────────

interface MenGuineaData {
  numero_agrement?: string;
  region_academique?: string;
  prefecture?: string;
  commune?: string;
  statut_juridique?: string;
  cycle?: string;
  date_ouverture?: string;
  capacite_accueil?: string;
  nombre_salles?: string;
  inspection_district?: string;
  _compliance_score?: number;
  _filled_fields?: number;
  _total_fields?: number;
}

interface RapportData {
  nom_etablissement: string;
  adresse: string;
  telephone: string;
  email: string;
  type: string;
  pays: string;
  annee_scolaire: string;
  numero_agrement: string;
  region_academique: string;
  prefecture: string;
  commune: string;
  statut_juridique: string;
  cycle: string;
  date_ouverture: string;
  capacite_accueil: string;
  nombre_salles: string;
  inspection_district: string;
  total_eleves: number;
  eleves_garcons: number;
  eleves_filles: number;
  total_enseignants: number;
  effectifs_par_niveau: Array<{ level: string; total: number; male: number; female: number }>;
  date_rapport: string;
  heure_rapport: string;
}

// ── Régions et statuts guinéens ────────────────────────────────────────────────

const REGIONS_GUINEE = [
  "Conakry", "Kindia", "Boké", "Labé", "Mamou",
  "Faranah", "Kankan", "Nzérékoré",
];

const STATUTS_JURIDIQUES = [
  "Public", "Privé laïc", "Privé confessionnel catholique",
  "Privé confessionnel islamique", "Privé confessionnel protestant",
];

const CYCLES = [
  "Préscolaire", "Primaire", "Secondaire général",
  "Secondaire technique", "Professionnel", "Supérieur",
];

// ── Compliance score color ────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return "text-green-700 bg-green-50 border-green-200";
  if (score >= 50) return "text-amber-700 bg-amber-50 border-amber-200";
  return "text-red-700 bg-red-50 border-red-200";
}

// ── Print rapport as HTML popup ────────────────────────────────────────────────

function printRapport(data: RapportData) {
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<title>Rapport MEN Guinée — ${data.nom_etablissement}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12px; color: #111; padding: 20mm; }
  .header { text-align: center; border-bottom: 3px double #c8102e; padding-bottom: 12px; margin-bottom: 16px; }
  .flag { font-size: 28px; }
  .republic { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #c8102e; font-weight: bold; }
  .ministry { font-size: 10px; color: #555; margin-top: 2px; }
  .school-name { font-size: 18px; font-weight: bold; margin: 10px 0 4px; }
  .doc-title { font-size: 13px; font-weight: bold; text-transform: uppercase; margin-top: 10px; background: #1a3c6e; color: white; padding: 6px 12px; }
  .section { margin: 14px 0; }
  .section-title { font-size: 11px; font-weight: bold; text-transform: uppercase; background: #f0f4f8; border-left: 3px solid #1a3c6e; padding: 4px 8px; margin-bottom: 8px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 16px; }
  .field { display: flex; flex-direction: column; margin-bottom: 4px; }
  .field-label { font-size: 9px; text-transform: uppercase; color: #666; }
  .field-value { font-size: 11px; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 2px; min-height: 14px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; font-size: 11px; }
  th { background: #1a3c6e; color: white; padding: 5px 8px; text-align: left; }
  td { padding: 4px 8px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) td { background: #f9f9f9; }
  .stats-box { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 8px 0; }
  .stat { text-align: center; border: 1px solid #ddd; border-radius: 4px; padding: 8px 4px; }
  .stat-num { font-size: 22px; font-weight: bold; color: #1a3c6e; }
  .stat-label { font-size: 9px; color: #666; }
  .signatures { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 40px; text-align: center; }
  .sig-box { border-top: 1px solid #333; padding-top: 6px; font-size: 10px; }
  .meta { font-size: 9px; color: #888; text-align: right; margin-top: 16px; border-top: 1px solid #eee; padding-top: 8px; }
  @media print { body { padding: 15mm; } }
</style>
</head>
<body>
<div class="header">
  <div class="flag">🇬🇳</div>
  <div class="republic">République de Guinée</div>
  <div class="ministry">Ministère de l'Éducation Nationale et de l'Alphabétisation</div>
  <div class="ministry">Direction Nationale de l'Enseignement Privé</div>
  <div class="school-name">${data.nom_etablissement}</div>
  <div style="font-size:10px;color:#555">${data.adresse || ''} — ${data.telephone || ''} — ${data.email || ''}</div>
  <div class="doc-title">Fiche de Déclaration Statistique — Année Scolaire ${data.annee_scolaire}</div>
</div>

<div class="section">
  <div class="section-title">I. Identification de l'établissement</div>
  <div class="grid-2">
    <div class="field"><span class="field-label">N° Agrément MEN</span><span class="field-value">${data.numero_agrement || '___________'}</span></div>
    <div class="field"><span class="field-label">Statut juridique</span><span class="field-value">${data.statut_juridique || '___________'}</span></div>
    <div class="field"><span class="field-label">Région académique</span><span class="field-value">${data.region_academique || '___________'}</span></div>
    <div class="field"><span class="field-label">Préfecture / Commune</span><span class="field-value">${data.prefecture || ''}${data.commune ? ' / ' + data.commune : ''}</span></div>
    <div class="field"><span class="field-label">Cycle d'enseignement</span><span class="field-value">${data.cycle || '___________'}</span></div>
    <div class="field"><span class="field-label">Date d'ouverture</span><span class="field-value">${data.date_ouverture || '___________'}</span></div>
    <div class="field"><span class="field-label">Inspection de district</span><span class="field-value">${data.inspection_district || '___________'}</span></div>
    <div class="field"><span class="field-label">Capacité d'accueil</span><span class="field-value">${data.capacite_accueil ? data.capacite_accueil + ' places' : '___________'}</span></div>
    <div class="field"><span class="field-label">Nombre de salles</span><span class="field-value">${data.nombre_salles ? data.nombre_salles + ' salles' : '___________'}</span></div>
  </div>
</div>

<div class="section">
  <div class="section-title">II. Effectifs globaux</div>
  <div class="stats-box">
    <div class="stat"><div class="stat-num">${data.total_eleves}</div><div class="stat-label">Total élèves</div></div>
    <div class="stat"><div class="stat-num" style="color:#2563eb">${data.eleves_garcons}</div><div class="stat-label">Garçons</div></div>
    <div class="stat"><div class="stat-num" style="color:#db2777">${data.eleves_filles}</div><div class="stat-label">Filles</div></div>
    <div class="stat"><div class="stat-num" style="color:#059669">${data.total_enseignants}</div><div class="stat-label">Enseignants</div></div>
  </div>
  ${data.total_eleves > 0 ? `<div style="font-size:10px;color:#555;margin-top:4px">Taux de féminisation : ${Math.round(data.eleves_filles / data.total_eleves * 100)}%</div>` : ''}
</div>

${data.effectifs_par_niveau.length > 0 ? `
<div class="section">
  <div class="section-title">III. Répartition des effectifs par niveau</div>
  <table>
    <thead><tr><th>Niveau</th><th>Total</th><th>Garçons</th><th>Filles</th><th>% Filles</th></tr></thead>
    <tbody>
      ${data.effectifs_par_niveau.map(r => `
      <tr>
        <td>${r.level}</td>
        <td><strong>${r.total}</strong></td>
        <td style="color:#2563eb">${r.male}</td>
        <td style="color:#db2777">${r.female}</td>
        <td>${r.total > 0 ? Math.round(r.female / r.total * 100) + '%' : '—'}</td>
      </tr>`).join('')}
      <tr style="font-weight:bold;background:#f0f4f8">
        <td>TOTAL</td>
        <td>${data.effectifs_par_niveau.reduce((s, r) => s + r.total, 0)}</td>
        <td style="color:#2563eb">${data.effectifs_par_niveau.reduce((s, r) => s + r.male, 0)}</td>
        <td style="color:#db2777">${data.effectifs_par_niveau.reduce((s, r) => s + r.female, 0)}</td>
        <td>—</td>
      </tr>
    </tbody>
  </table>
</div>` : ''}

<div class="signatures">
  <div class="sig-box">Le Directeur de l'établissement<br><br><br><br>Signature et cachet</div>
  <div class="sig-box">L'Inspecteur de district<br><br><br><br>Signature et cachet</div>
  <div class="sig-box">Le Directeur Régional de l'Éducation<br><br><br><br>Signature et cachet</div>
</div>

<div class="meta">Rapport généré le ${data.date_rapport} à ${data.heure_rapport} par SchoolFlow Pro — ${data.nom_etablissement}</div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) return;
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 500);
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function MinistryDashboard() {
  const { tenant } = useTenant();
  const { formatCurrency } = useCurrency();
  const { studentsLabel, StudentsLabel } = useStudentLabel();
  const queryClient = useQueryClient();
  const [exportLoading, setExportLoading] = useState(false);

  // ── Tab 1: KPIs ──────────────────────────────────────────────────────────────

  const { data: kpis, isLoading } = useQuery({
    ...adminQueries.ministryKPIs(tenant?.id || ""),
    enabled: !!tenant?.id,
  });

  const { data: levelStats = [] } = useQuery({
    queryKey: ["ministry-level-stats", tenant?.id],
    queryFn: async () => {
      const r = await apiClient.get("/analytics/ministry-stats/levels/");
      return r.data as Array<{
        level: string; total: number; male: number; female: number; avg_grade: number;
      }>;
    },
    enabled: !!tenant?.id,
  });

  const refreshMutation = useMutation({
    mutationFn: adminQueries.refreshMinistryDashboard,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-ministry-kpis", tenant?.id] });
      toastService.success("Données institutionnelles rafraîchies");
    },
    onError: (error: any) => toastService.error("Échec du rafraîchissement", error.message),
  });

  // ── Tab 2: MEN Guinée conformité ──────────────────────────────────────────────

  const { data: menData, isLoading: menLoading } = useQuery<MenGuineaData>({
    queryKey: ["men-guinea", tenant?.id],
    queryFn: async () => {
      const r = await apiClient.get("/tenants/men-guinea/");
      return r.data;
    },
    enabled: !!tenant?.id,
  });

  const [menForm, setMenForm] = useState<Partial<MenGuineaData>>({});
  const [formDirty, setFormDirty] = useState(false);

  const setField = (key: keyof MenGuineaData, value: string) => {
    setMenForm(prev => ({ ...prev, [key]: value }));
    setFormDirty(true);
  };

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<MenGuineaData>) => {
      const r = await apiClient.patch("/tenants/men-guinea/", data);
      return r.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["men-guinea", tenant?.id] });
      setFormDirty(false);
      toastService.success("Informations MEN enregistrées");
    },
    onError: (err: any) =>
      toastService.error("Erreur", err.response?.data?.detail || err.message),
  });

  const handleSave = () => {
    const payload: Record<string, string> = {};
    Object.entries(menForm).forEach(([k, v]) => {
      if (!k.startsWith("_") && v !== undefined && v !== "") payload[k] = v as string;
    });
    saveMutation.mutate(payload);
  };

  // Merged display values: saved data overridden by dirty form values
  const merged: MenGuineaData = { ...menData, ...menForm };
  const score = menData?._compliance_score ?? 0;
  const filled = menData?._filled_fields ?? 0;
  const total = menData?._total_fields ?? 10;

  // ── Rapport MEN ──────────────────────────────────────────────────────────────

  const { data: rapportData, isFetching: rapportLoading } = useQuery<RapportData>({
    queryKey: ["men-guinea-rapport", tenant?.id],
    queryFn: async () => {
      const r = await apiClient.get("/tenants/men-guinea/rapport/");
      return r.data;
    },
    enabled: false, // manual trigger
  });

  const handlePrintRapport = async () => {
    try {
      const r = await apiClient.get("/tenants/men-guinea/rapport/");
      printRapport(r.data);
    } catch (err: any) {
      toastService.error("Erreur", err.response?.data?.detail || err.message);
    }
  };

  // ── Charts ────────────────────────────────────────────────────────────────────

  const genderData = kpis ? [
    { name: "Garçons", value: kpis.students_male, color: "#3b82f6" },
    { name: "Filles", value: kpis.students_female, color: "#ec4899" },
  ] : [];

  const onboardingSteps = [
    {
      target: "#ministry-stats",
      title: "Indicateurs Clés",
      content: `Suivez ici la santé globale de votre établissement.`,
    },
    {
      target: "#men-compliance",
      title: "Conformité MEN Guinée",
      content: "Renseignez les informations officielles requises par le Ministère de l'Éducation Nationale.",
    },
  ];

  return (
    <div className="space-y-6 pb-12">
      <TooltipTour steps={onboardingSteps} storageKey="ministry-tour-v2" />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-primary" />
            Reporting Institutionnel
            <Badge variant="outline" className="ml-2 text-xs border-green-500 text-green-700 bg-green-50">
              🇬🇳 Guinée
            </Badge>
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Indicateurs de performance + conformité Ministère de l'Éducation Nationale
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="outline" size="sm"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
          >
            <RefreshCcw className={cn("h-4 w-4 mr-1.5", refreshMutation.isPending && "animate-spin")} />
            Actualiser
          </Button>
          <Button size="sm" variant="outline" disabled={exportLoading} onClick={async () => {
            setExportLoading(true);
            try {
              const r = await apiClient.get("/analytics/ministry-export/csv/", { responseType: "blob" });
              const url = URL.createObjectURL(new Blob([r.data], { type: "text/csv;charset=utf-8;" }));
              const a = document.createElement("a");
              a.href = url; a.download = `rapport_men_${new Date().toISOString().split("T")[0]}.csv`;
              document.body.appendChild(a); a.click();
              document.body.removeChild(a); URL.revokeObjectURL(url);
              toastService.success("CSV exporté");
            } catch (err: any) {
              toastService.error("Erreur d'export", err.response?.data?.detail || err.message);
            } finally { setExportLoading(false); }
          }}>
            <FileSpreadsheet className="h-4 w-4 mr-1.5" />
            {exportLoading ? "Export..." : "Export CSV"}
          </Button>
          <Button size="sm" onClick={handlePrintRapport} disabled={rapportLoading}>
            <Printer className="h-4 w-4 mr-1.5" />
            Fiche MEN (impression)
          </Button>
        </div>
      </div>

      <Tabs defaultValue="kpis">
        <TabsList className="mb-4">
          <TabsTrigger value="kpis" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            Tableau de bord
          </TabsTrigger>
          <TabsTrigger value="conformite" className="gap-2" id="men-compliance">
            <ClipboardList className="h-4 w-4" />
            Conformité MEN
            {score > 0 && (
              <Badge
                variant="outline"
                className={cn("ml-1 text-[10px] px-1.5", scoreColor(score))}
              >
                {score}%
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── Onglet 1 : KPIs ──────────────────────────────────────────────── */}
        <TabsContent value="kpis" className="space-y-6">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">
              Chargement des données institutionnelles...
            </div>
          ) : (
            <>
              {/* KPI cards */}
              <div id="ministry-stats" className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Total {StudentsLabel}</CardTitle>
                    <Users className="h-4 w-4 text-primary" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{kpis?.total_students || 0}</div>
                    <p className="text-xs text-muted-foreground">Effectifs actifs consolidés</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Assiduité Globale</CardTitle>
                    <Calendar className="h-4 w-4 text-emerald-500" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-2xl font-bold">{kpis?.attendance_rate || 0}%</div>
                    <Progress value={kpis?.attendance_rate || 0} className="h-1" />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Moyenne Académique</CardTitle>
                    <GraduationCap className="h-4 w-4 text-purple-500" />
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{kpis?.average_grade || 0}/20</div>
                    <p className="text-xs text-muted-foreground">Moyenne générale</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-sm font-medium">Taux Recouvrement</CardTitle>
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="text-2xl font-bold">{kpis?.collection_rate || 0}%</div>
                    <Progress value={kpis?.collection_rate || 0} className="h-1" />
                  </CardContent>
                </Card>
              </div>

              {/* Effectifs par niveau */}
              {levelStats.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BookOpen className="h-4 w-4 text-indigo-500" />
                      Effectifs par niveau
                    </CardTitle>
                    <CardDescription>
                      Répartition des {studentsLabel.toLowerCase()} par niveau scolaire
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-2 font-medium text-muted-foreground">Niveau</th>
                            <th className="text-right py-2 font-medium text-muted-foreground">Total</th>
                            <th className="text-right py-2 font-medium text-muted-foreground">Garçons</th>
                            <th className="text-right py-2 font-medium text-muted-foreground">Filles</th>
                            <th className="text-right py-2 font-medium text-muted-foreground">% Filles</th>
                            <th className="text-right py-2 font-medium text-muted-foreground">Moy. /20</th>
                          </tr>
                        </thead>
                        <tbody>
                          {levelStats.map((row) => {
                            const girlRate = row.total > 0 ? Math.round(row.female / row.total * 100) : 0;
                            return (
                              <tr key={row.level} className="border-b last:border-0 hover:bg-muted/30">
                                <td className="py-2 font-medium">{row.level}</td>
                                <td className="py-2 text-right font-bold">{row.total}</td>
                                <td className="py-2 text-right text-blue-600">{row.male}</td>
                                <td className="py-2 text-right text-pink-600">{row.female}</td>
                                <td className="py-2 text-right">
                                  <Badge variant="outline" className={girlRate >= 40
                                    ? "border-green-500 text-green-700 bg-green-50"
                                    : "border-orange-400 text-orange-700 bg-orange-50"
                                  }>{girlRate}%</Badge>
                                </td>
                                <td className={cn("py-2 text-right font-medium",
                                  row.avg_grade >= 12 ? "text-green-600"
                                    : row.avg_grade >= 10 ? "text-orange-600" : "text-red-600"
                                )}>{row.avg_grade > 0 ? row.avg_grade : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr className="border-t-2 font-bold">
                            <td className="py-2">Total</td>
                            <td className="py-2 text-right">{levelStats.reduce((s, r) => s + r.total, 0)}</td>
                            <td className="py-2 text-right text-blue-600">{levelStats.reduce((s, r) => s + r.male, 0)}</td>
                            <td className="py-2 text-right text-pink-600">{levelStats.reduce((s, r) => s + r.female, 0)}</td>
                            <td colSpan={2} className="py-2 text-right text-muted-foreground">—</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Gender + Finance */}
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
                <Card className="lg:col-span-3">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <PieChartIcon className="h-4 w-4 text-primary" />
                      Démographie des {studentsLabel}
                    </CardTitle>
                    <CardDescription>Répartition par genre</CardDescription>
                  </CardHeader>
                  <CardContent className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={genderData} cx="50%" cy="50%" innerRadius={55} outerRadius={90}
                          paddingAngle={5} dataKey="value">
                          {genderData.map((entry, i) => (
                            <Cell key={i} fill={entry.color} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card id="ministry-finance" className="lg:col-span-4">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      Flux Financiers
                    </CardTitle>
                    <CardDescription>Revenus attendus vs collectés</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6 pt-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Revenus Collectés</span>
                        <span className="font-bold text-emerald-600">
                          {formatCurrency(kpis?.total_revenue_collected || 0)}
                        </span>
                      </div>
                      <Progress
                        value={(kpis?.total_revenue_collected / kpis?.total_revenue_expected) * 100 || 0}
                        className="h-3"
                      />
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="p-4 rounded-xl bg-muted/30 border">
                        <p className="text-xs text-muted-foreground uppercase mb-1">Total Attendu</p>
                        <p className="text-xl font-bold">{formatCurrency(kpis?.total_revenue_expected || 0)}</p>
                      </div>
                      <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-100">
                        <p className="text-xs text-emerald-700 uppercase mb-1">Restant à Collecter</p>
                        <p className="text-xl font-bold text-emerald-900">
                          {formatCurrency((kpis?.total_revenue_expected || 0) - (kpis?.total_revenue_collected || 0))}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </>
          )}
        </TabsContent>

        {/* ── Onglet 2 : Conformité MEN Guinée ──────────────────────────────── */}
        <TabsContent value="conformite" className="space-y-6">

          {/* Score de conformité */}
          <Card className={cn("border-2", score >= 80 ? "border-green-200" : score >= 50 ? "border-amber-200" : "border-red-200")}>
            <CardContent className="p-5">
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold text-sm">Score de conformité MEN Guinée</p>
                    <span className={cn("text-2xl font-bold", scoreColor(score).split(" ")[0])}>
                      {score}%
                    </span>
                  </div>
                  <Progress value={score} className="h-3" />
                  <p className="text-xs text-muted-foreground">
                    {filled} sur {total} informations officielles renseignées
                    {score < 100 && ` — ${total - filled} champ(s) manquant(s)`}
                  </p>
                </div>
                {score >= 80 ? (
                  <div className="flex items-center gap-2 text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 shrink-0">
                    <CheckCircle2 className="h-5 w-5" />
                    <span className="text-sm font-medium">Conforme</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 shrink-0">
                    <AlertCircle className="h-5 w-5" />
                    <span className="text-sm font-medium">Incomplet</span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Formulaire */}
          {menLoading ? (
            <div className="p-6 text-center text-muted-foreground">Chargement des informations MEN...</div>
          ) : (
            <div className="grid gap-6 md:grid-cols-2">

              {/* Identification officielle */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    Identification officielle
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="numero_agrement" className="text-xs">
                      Numéro d'agrément MEN{" "}
                      {!merged.numero_agrement && <span className="text-red-500">*</span>}
                    </Label>
                    <Input
                      id="numero_agrement"
                      placeholder="ex: AG/MEN/2024/001"
                      value={merged.numero_agrement || ""}
                      onChange={e => setField("numero_agrement", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="statut_juridique" className="text-xs">
                      Statut juridique{" "}
                      {!merged.statut_juridique && <span className="text-red-500">*</span>}
                    </Label>
                    <Select
                      value={merged.statut_juridique || ""}
                      onValueChange={v => setField("statut_juridique", v)}
                    >
                      <SelectTrigger id="statut_juridique">
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUTS_JURIDIQUES.map(s => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="cycle" className="text-xs">
                      Cycle d'enseignement{" "}
                      {!merged.cycle && <span className="text-red-500">*</span>}
                    </Label>
                    <Select
                      value={merged.cycle || ""}
                      onValueChange={v => setField("cycle", v)}
                    >
                      <SelectTrigger id="cycle">
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                      <SelectContent>
                        {CYCLES.map(c => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="date_ouverture" className="text-xs">Date d'ouverture</Label>
                    <Input
                      id="date_ouverture"
                      type="date"
                      value={merged.date_ouverture || ""}
                      onChange={e => setField("date_ouverture", e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Localisation */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-primary" />
                    Localisation administrative
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="region_academique" className="text-xs">
                      Région académique{" "}
                      {!merged.region_academique && <span className="text-red-500">*</span>}
                    </Label>
                    <Select
                      value={merged.region_academique || ""}
                      onValueChange={v => setField("region_academique", v)}
                    >
                      <SelectTrigger id="region_academique">
                        <SelectValue placeholder="Sélectionner..." />
                      </SelectTrigger>
                      <SelectContent>
                        {REGIONS_GUINEE.map(r => (
                          <SelectItem key={r} value={r}>{r}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="prefecture" className="text-xs">
                      Préfecture / Commune de Conakry{" "}
                      {!merged.prefecture && <span className="text-red-500">*</span>}
                    </Label>
                    <Input
                      id="prefecture"
                      placeholder="ex: Matam, Ratoma, Kindia..."
                      value={merged.prefecture || ""}
                      onChange={e => setField("prefecture", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="commune" className="text-xs">Commune / Sous-préfecture</Label>
                    <Input
                      id="commune"
                      placeholder="ex: Hamdallaye, Madina..."
                      value={merged.commune || ""}
                      onChange={e => setField("commune", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="inspection_district" className="text-xs">
                      Inspection de district{" "}
                      {!merged.inspection_district && <span className="text-red-500">*</span>}
                    </Label>
                    <Input
                      id="inspection_district"
                      placeholder="ex: DPE Ratoma, IRE Kindia..."
                      value={merged.inspection_district || ""}
                      onChange={e => setField("inspection_district", e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Infrastructure */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    Infrastructure
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="capacite_accueil" className="text-xs">
                      Capacité d'accueil (nombre de places)
                    </Label>
                    <Input
                      id="capacite_accueil"
                      type="number"
                      min={0}
                      placeholder="ex: 500"
                      value={merged.capacite_accueil || ""}
                      onChange={e => setField("capacite_accueil", e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="nombre_salles" className="text-xs">
                      Nombre de salles de classe
                    </Label>
                    <Input
                      id="nombre_salles"
                      type="number"
                      min={0}
                      placeholder="ex: 12"
                      value={merged.nombre_salles || ""}
                      onChange={e => setField("nombre_salles", e.target.value)}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Aide */}
              <Card className="border-blue-100 bg-blue-50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-blue-800 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Pourquoi ces informations ?
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-blue-700 space-y-2">
                  <p>Ces données sont requises par le <strong>Ministère de l'Éducation Nationale et de l'Alphabétisation de Guinée</strong> pour :</p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>La fiche de déclaration statistique annuelle (formulaire officiel)</li>
                    <li>Le suivi des effectifs par la Direction Régionale de l'Éducation</li>
                    <li>Le renouvellement de l'agrément d'ouverture</li>
                    <li>Les rapports à destination des partenaires éducatifs (UNICEF, UNESCO)</li>
                  </ul>
                  <p className="mt-2 font-medium">Les champs marqués <span className="text-red-500">*</span> sont obligatoires pour le rapport MEN.</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Bouton sauvegarder */}
          <div className="flex justify-end gap-3">
            <Button
              onClick={handleSave}
              disabled={!formDirty || saveMutation.isPending}
            >
              <Save className="h-4 w-4 mr-2" />
              {saveMutation.isPending ? "Enregistrement..." : "Enregistrer les informations MEN"}
            </Button>
            <Button variant="outline" onClick={handlePrintRapport} disabled={rapportLoading}>
              <Printer className="h-4 w-4 mr-2" />
              Générer la fiche officielle
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
