/**
 * Super-admin SaaS Dashboard — SchoolFlow Pro
 * Affiche les métriques de la plateforme : MRR, tenants, conversions, etc.
 * Accessible uniquement aux SUPER_ADMIN.
 */
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  TrendingUp, Users, Building2, DollarSign, AlertTriangle, RefreshCw,
  Search, ExternalLink, Zap, Shield, Activity, BarChart3, Globe,
  ChevronLeft, ChevronRight, LogIn, Crown,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaasMetrics {
  total_tenants: number;
  active_tenants: number;
  trialing_tenants: number;
  expired_trials: number;
  past_due_tenants: number;
  canceled_tenants: number;
  mrr_usd: number;
  arr_usd: number;
  conversion_rate_pct: number;
  by_plan: { starter: number; pro: number; enterprise: number };
  by_status: Record<string, number>;
  new_tenants_7d: number;
  new_tenants_30d: number;
  new_tenants_90d: number;
  signups_trend: { date: string; count: number }[];
  revenue_trend: { month: string; mrr: number }[];
  top_countries: { country: string; count: number }[];
  past_due_list: { id: string; name: string; slug: string; plan: string; since: string | null }[];
  generated_at: string;
}

interface TenantItem {
  id: string;
  name: string;
  slug: string;
  type: string;
  country: string;
  email: string | null;
  is_active: boolean;
  subscription_plan: string;
  subscription_status: string;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  user_count: number;
  created_at: string | null;
}

interface TenantsPage {
  total: number;
  page: number;
  page_size: number;
  pages: number;
  items: TenantItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const PLAN_LABELS: Record<string, string> = {
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
};

const PLAN_COLORS: Record<string, string> = {
  starter: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  pro: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  enterprise: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  trialing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  past_due: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  canceled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  unpaid: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  other: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

const STATUS_LABELS: Record<string, string> = {
  active: "Actif",
  trialing: "Essai",
  past_due: "En retard",
  canceled: "Annulé",
  unpaid: "Impayé",
};

function fmt(n: number, decimals = 0): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: decimals }).format(n);
}

function fmtUSD(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-indigo-600 dark:text-indigo-400",
  alert = false,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? "border-orange-200 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/20" : ""}>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg bg-gray-100 dark:bg-gray-800 ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
            <p className="text-2xl font-bold text-gray-900 dark:text-white mt-0.5">{value}</p>
            {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PlanBadge({ plan }: { plan: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLAN_COLORS[plan] || PLAN_COLORS.starter}`}>
      {PLAN_LABELS[plan] || plan}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[status] || STATUS_COLORS.other}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

// ─── Bar chart (pure CSS, no external lib) ───────────────────────────────────

function MiniBarChart({ data, label }: { data: { label: string; value: number }[]; label: string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div>
      <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">{label}</p>
      <div className="flex items-end gap-1 h-20">
        {data.map((d) => (
          <div key={d.label} className="flex flex-col items-center gap-1 flex-1">
            <div
              className="w-full rounded-t bg-indigo-500 dark:bg-indigo-600 transition-all"
              style={{ height: `${(d.value / max) * 64}px`, minHeight: d.value ? "4px" : "0px" }}
              title={`${d.label}: ${d.value}`}
            />
            <span className="text-[9px] text-gray-400 dark:text-gray-500 truncate w-full text-center">
              {d.label.slice(-5)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SaaSDashboard() {
  const qc = useQueryClient();
  const [tenantSearch, setTenantSearch] = useState("");
  const [tenantPlanFilter, setTenantPlanFilter] = useState("all");
  const [tenantStatusFilter, setTenantStatusFilter] = useState("all");
  const [page, setPage] = useState(1);

  // ── Metrics query
  const {
    data: metrics,
    isLoading: metricsLoading,
    refetch: refetchMetrics,
    error: metricsError,
  } = useQuery<SaasMetrics>({
    queryKey: ["saas-metrics"],
    queryFn: () => apiClient.get("/platform/saas-metrics/").then((r) => r.data),
    refetchInterval: 60_000, // auto-refresh every 60s
  });

  // ── Tenants query
  const {
    data: tenantsPage,
    isLoading: tenantsLoading,
  } = useQuery<TenantsPage>({
    queryKey: ["platform-tenants", page, tenantSearch, tenantPlanFilter, tenantStatusFilter],
    queryFn: () => {
      const params = new URLSearchParams({
        page: String(page),
        page_size: "20",
      });
      if (tenantSearch) params.set("search", tenantSearch);
      if (tenantPlanFilter !== "all") params.set("plan", tenantPlanFilter);
      if (tenantStatusFilter !== "all") params.set("sub_status", tenantStatusFilter);
      return apiClient.get(`/platform/tenants/?${params}`).then((r) => r.data);
    },
  });

  // ── Impersonate mutation
  const impersonateMutation = useMutation({
    mutationFn: (tenantId: string) =>
      apiClient.post(`/platform/tenants/${tenantId}/impersonate/`).then((r) => r.data),
    onSuccess: (data) => {
      // Store token and redirect to tenant dashboard
      localStorage.setItem("schoolflow:access_token", data.access_token);
      localStorage.setItem("schoolflow:impersonating", "true");
      toast.success(`Connexion en tant qu'admin de ${data.tenant_name} (15 min)`);
      window.location.href = `/${data.tenant_slug}/admin`;
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || "Erreur lors de l'impersonation");
    },
  });

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTenantSearch(e.target.value);
    setPage(1);
  };

  const handlePlanFilter = (v: string) => {
    setTenantPlanFilter(v);
    setPage(1);
  };

  const handleStatusFilter = (v: string) => {
    setTenantStatusFilter(v);
    setPage(1);
  };

  // ── Trend data for charts
  const signupsChartData = (metrics?.signups_trend || []).slice(-14).map((d) => ({
    label: d.date,
    value: d.count,
  }));

  const revenueChartData = (metrics?.revenue_trend || []).map((d) => ({
    label: d.month,
    value: d.mrr,
  }));

  return (
    <div className="p-6 space-y-6 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Crown className="w-6 h-6 text-yellow-500" />
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">SaaS Dashboard</h1>
            <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 hover:bg-purple-100">
              SUPER_ADMIN
            </Badge>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Métriques de la plateforme SchoolFlow Pro
            {metrics?.generated_at && (
              <span className="ml-2 text-xs">
                — Mis à jour à {new Date(metrics.generated_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => { refetchMetrics(); qc.invalidateQueries({ queryKey: ["platform-tenants"] }); }}
          disabled={metricsLoading}
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${metricsLoading ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      {metricsError && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>Impossible de charger les métriques. Vérifiez votre connexion.</AlertDescription>
        </Alert>
      )}

      {metrics?.past_due_list && metrics.past_due_list.length > 0 && (
        <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
          <AlertTriangle className="w-4 h-4 text-orange-500" />
          <AlertDescription className="text-orange-800 dark:text-orange-300">
            <strong>{metrics.past_due_list.length} établissement(s)</strong> ont des paiements en retard.
            Vérifiez la liste dans l'onglet Tenants.
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="tenants">Établissements</TabsTrigger>
          <TabsTrigger value="growth">Croissance</TabsTrigger>
        </TabsList>

        {/* ── Overview tab ─────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={DollarSign}
              label="MRR (USD)"
              value={metricsLoading ? "…" : fmtUSD(metrics?.mrr_usd ?? 0)}
              sub={metrics ? `ARR : ${fmtUSD(metrics.arr_usd)}` : undefined}
              color="text-green-600 dark:text-green-400"
            />
            <KpiCard
              icon={Building2}
              label="Établissements actifs"
              value={metricsLoading ? "…" : fmt(metrics?.active_tenants ?? 0)}
              sub={metrics ? `${fmt(metrics.total_tenants)} total` : undefined}
            />
            <KpiCard
              icon={Zap}
              label="En période d'essai"
              value={metricsLoading ? "…" : fmt(metrics?.trialing_tenants ?? 0)}
              sub={metrics ? `${metrics.conversion_rate_pct}% de conversion` : undefined}
              color="text-blue-600 dark:text-blue-400"
            />
            <KpiCard
              icon={AlertTriangle}
              label="Paiements en retard"
              value={metricsLoading ? "…" : fmt(metrics?.past_due_tenants ?? 0)}
              color="text-orange-600 dark:text-orange-400"
              alert={(metrics?.past_due_tenants ?? 0) > 0}
            />
          </div>

          {/* Growth + Plans row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              icon={TrendingUp}
              label="Nouveaux (7 jours)"
              value={metricsLoading ? "…" : `+${fmt(metrics?.new_tenants_7d ?? 0)}`}
              sub={metrics ? `+${fmt(metrics.new_tenants_30d)} ce mois` : undefined}
              color="text-indigo-600 dark:text-indigo-400"
            />
            <KpiCard
              icon={Activity}
              label="Essais expirés (non convertis)"
              value={metricsLoading ? "…" : fmt(metrics?.expired_trials ?? 0)}
              color="text-gray-500"
            />
            <KpiCard
              icon={Users}
              label="Annulés"
              value={metricsLoading ? "…" : fmt(metrics?.canceled_tenants ?? 0)}
              color="text-red-500 dark:text-red-400"
            />
          </div>

          {/* Plan distribution + Countries */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Plan distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Répartition par plan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {["starter", "pro", "enterprise"].map((p) => {
                  const count = metrics?.by_plan[p as keyof typeof metrics.by_plan] ?? 0;
                  const total = metrics?.total_tenants || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={p} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{PLAN_LABELS[p]}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {metricsLoading ? "…" : `${fmt(count)} (${pct}%)`}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            p === "enterprise" ? "bg-purple-500" : p === "pro" ? "bg-indigo-500" : "bg-gray-400"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Top countries */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Globe className="w-4 h-4 text-indigo-500" />
                  Top pays
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(metrics?.top_countries || []).slice(0, 8).map((c) => (
                    <div key={c.country} className="flex items-center justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300 font-mono">{c.country}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full">
                          <div
                            className="h-1.5 bg-indigo-400 rounded-full"
                            style={{
                              width: `${Math.round((c.count / (metrics?.total_tenants || 1)) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-gray-500 dark:text-gray-400 w-6 text-right">{c.count}</span>
                      </div>
                    </div>
                  ))}
                  {(!metrics || metrics.top_countries.length === 0) && (
                    <p className="text-sm text-gray-400 dark:text-gray-500">Aucune donnée</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Past due alert list */}
          {metrics?.past_due_list && metrics.past_due_list.length > 0 && (
            <Card className="border-orange-200 dark:border-orange-800">
              <CardHeader>
                <CardTitle className="text-base text-orange-700 dark:text-orange-400 flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Paiements en retard
                </CardTitle>
                <CardDescription>Ces établissements nécessitent une action.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {metrics.past_due_list.map((t) => (
                    <div key={t.id} className="flex items-center justify-between rounded-lg bg-orange-50 dark:bg-orange-950/30 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{t.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">/{t.slug} · {PLAN_LABELS[t.plan] || t.plan}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => window.open(`/${t.slug}/admin/billing`, "_blank")}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          Billing
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => impersonateMutation.mutate(t.id)}
                          disabled={impersonateMutation.isPending}
                        >
                          <LogIn className="w-3 h-3 mr-1" />
                          Accès
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Tenants tab ───────────────────────────────────────────────────── */}
        <TabsContent value="tenants" className="space-y-4 mt-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
              <Input
                className="pl-8 h-9"
                placeholder="Rechercher par nom, slug, email…"
                value={tenantSearch}
                onChange={handleSearch}
              />
            </div>
            <Select value={tenantPlanFilter} onValueChange={handlePlanFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder="Tous les plans" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les plans</SelectItem>
                <SelectItem value="starter">Starter</SelectItem>
                <SelectItem value="pro">Pro</SelectItem>
                <SelectItem value="enterprise">Enterprise</SelectItem>
              </SelectContent>
            </Select>
            <Select value={tenantStatusFilter} onValueChange={handleStatusFilter}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue placeholder="Tous statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="active">Actif</SelectItem>
                <SelectItem value="trialing">Essai</SelectItem>
                <SelectItem value="past_due">En retard</SelectItem>
                <SelectItem value="canceled">Annulé</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Établissement</TableHead>
                    <TableHead>Plan</TableHead>
                    <TableHead>Statut</TableHead>
                    <TableHead className="text-right">Utilisateurs</TableHead>
                    <TableHead>Pays</TableHead>
                    <TableHead>Créé le</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenantsLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-400 dark:text-gray-500">
                        Chargement…
                      </TableCell>
                    </TableRow>
                  ) : (tenantsPage?.items || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-400 dark:text-gray-500">
                        Aucun établissement trouvé
                      </TableCell>
                    </TableRow>
                  ) : (
                    (tenantsPage?.items || []).map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white text-sm">{t.name}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">/{t.slug}</p>
                          </div>
                        </TableCell>
                        <TableCell><PlanBadge plan={t.subscription_plan} /></TableCell>
                        <TableCell><StatusBadge status={t.subscription_status} /></TableCell>
                        <TableCell className="text-right text-sm text-gray-600 dark:text-gray-300">
                          {fmt(t.user_count)}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{t.country}</span>
                        </TableCell>
                        <TableCell className="text-xs text-gray-400 dark:text-gray-500">
                          {t.created_at ? new Date(t.created_at).toLocaleDateString("fr-FR") : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => window.open(`/${t.slug}/admin`, "_blank")}
                              title="Voir le dashboard"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => impersonateMutation.mutate(t.id)}
                              disabled={impersonateMutation.isPending}
                              title="Accès temporaire (15 min)"
                            >
                              <LogIn className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Pagination */}
          {tenantsPage && tenantsPage.pages > 1 && (
            <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400">
              <span>
                {fmt((page - 1) * (tenantsPage.page_size) + 1)}–
                {fmt(Math.min(page * tenantsPage.page_size, tenantsPage.total))} sur {fmt(tenantsPage.total)}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="flex items-center px-2">
                  {page} / {tenantsPage.pages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-2"
                  disabled={page >= tenantsPage.pages}
                  onClick={() => setPage(page + 1)}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ── Growth tab ────────────────────────────────────────────────────── */}
        <TabsContent value="growth" className="space-y-4 mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Signups trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Inscriptions — 14 derniers jours</CardTitle>
                <CardDescription>Nouveaux établissements par jour</CardDescription>
              </CardHeader>
              <CardContent>
                {signupsChartData.length > 0 ? (
                  <MiniBarChart data={signupsChartData} label="" />
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">Aucune donnée disponible</p>
                )}
              </CardContent>
            </Card>

            {/* Revenue trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">MRR estimé — 6 derniers mois</CardTitle>
                <CardDescription>Revenus mensuels récurrents (USD)</CardDescription>
              </CardHeader>
              <CardContent>
                {revenueChartData.length > 0 ? (
                  <MiniBarChart data={revenueChartData} label="" />
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">Aucune donnée disponible</p>
                )}
              </CardContent>
            </Card>

            {/* Growth stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-500" />
                  Acquisition
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: "7 jours", value: metrics?.new_tenants_7d ?? 0, color: "bg-indigo-400" },
                  { label: "30 jours", value: metrics?.new_tenants_30d ?? 0, color: "bg-indigo-500" },
                  { label: "90 jours", value: metrics?.new_tenants_90d ?? 0, color: "bg-indigo-600" },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-300">{row.label}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-32 h-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                        <div
                          className={`h-2 ${row.color} rounded-full`}
                          style={{
                            width: `${Math.min(100, (row.value / Math.max(metrics?.new_tenants_90d || 1, 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="font-semibold text-gray-900 dark:text-white w-6 text-right">
                        +{metricsLoading ? "…" : fmt(row.value)}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Conversion funnel */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Shield className="w-4 h-4 text-green-500" />
                  Tunnel de conversion
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  {
                    label: "Inscrits (essai)",
                    value: (metrics?.trialing_tenants ?? 0) + (metrics?.expired_trials ?? 0),
                    color: "bg-blue-400",
                  },
                  {
                    label: "Essais expirés",
                    value: metrics?.expired_trials ?? 0,
                    color: "bg-orange-400",
                  },
                  {
                    label: "Convertis (payants actifs)",
                    value: metrics?.active_tenants ?? 0,
                    color: "bg-green-500",
                  },
                ].map((row, idx) => {
                  const total = (metrics?.trialing_tenants ?? 0) + (metrics?.expired_trials ?? 0) + (metrics?.active_tenants ?? 0) || 1;
                  return (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 dark:text-gray-300">{row.label}</span>
                      <div className="flex items-center gap-2">
                        <div className="w-32 h-2 bg-gray-100 dark:bg-gray-800 rounded-full">
                          <div
                            className={`h-2 ${row.color} rounded-full`}
                            style={{ width: `${Math.round((row.value / total) * 100)}%` }}
                          />
                        </div>
                        <span className="font-semibold text-gray-900 dark:text-white w-6 text-right">
                          {metricsLoading ? "…" : fmt(row.value)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                <Separator />
                <div className="flex justify-between text-sm font-medium">
                  <span className="text-gray-700 dark:text-gray-300">Taux de conversion</span>
                  <span className={`font-bold ${(metrics?.conversion_rate_pct ?? 0) >= 20 ? "text-green-600 dark:text-green-400" : "text-orange-600 dark:text-orange-400"}`}>
                    {metricsLoading ? "…" : `${metrics?.conversion_rate_pct ?? 0}%`}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
