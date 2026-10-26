/**
 * Super-admin SaaS Dashboard — Academy Guinéenne
 * Affiche les métriques de la plateforme : MRR, tenants, conversions, etc.
 * Accessible uniquement aux SUPER_ADMIN.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  ChevronLeft, ChevronRight, LogIn, Crown, Hourglass, Wallet, CalendarClock,
} from "lucide-react";
import { Link } from "react-router-dom";
import { PLAN_SLUGS, formatEur, planLabel } from "@/lib/pricing";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SaasMetrics {
  total_tenants: number;
  active_tenants: number;
  trialing_tenants: number;
  expired_trials: number;
  past_due_tenants: number;
  canceled_tenants: number;
  mrr_eur: number;
  arr_eur: number;
  conversion_rate_pct: number;
  by_plan: Record<string, number>;
  by_status: Record<string, number>;
  new_tenants_7d: number;
  new_tenants_30d: number;
  new_tenants_90d: number;
  signups_trend: { date: string; count: number }[];
  revenue_trend: { month: string; mrr: number }[];
  top_countries: { country: string; count: number }[];
  past_due_list: { id: string; name: string; slug: string; plan: string; since: string | null }[];
  local_billing?: {
    active_subscriptions: number;
    pending_requests: number;
    mrr_by_currency: { currency: string; mrr: number; arr: number }[];
    expiring_soon: { tenant_name: string | null; tenant_slug: string | null; plan: string | null; period_end: string }[];
  };
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

const PLAN_COLORS: Record<string, string> = {
  other: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  standard: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  medium: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300",
  premium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  enterprise: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300",
};

const PLAN_BAR_COLORS: Record<string, string> = {
  standard: "bg-sky-500",
  medium: "bg-indigo-500",
  premium: "bg-amber-500",
  enterprise: "bg-purple-500",
  other: "bg-gray-400",
};

const STATUS_COLORS: Record<string, string> = {
  active: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  trialing: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  past_due: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  expired: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300",
  canceled: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  unpaid: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  other: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

// Libellés : saasDashboard.status.* (locales).
const STATUS_KEYS = ["active", "trialing", "expired", "past_due", "canceled", "unpaid"];

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
  const { t } = useTranslation();
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${PLAN_COLORS[plan] || PLAN_COLORS.other}`}>
      {planLabel(t, plan)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[status] || STATUS_COLORS.other}`}>
      {STATUS_KEYS.includes(status) ? t(`saasDashboard.status.${status}`) : status}
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
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const fmt = (n: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(n);
  const fmtEUR = (n: number) => formatEur(n, locale, 0);
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
      toast.success(t("saasDashboard.impersonated", { name: data.tenant_name }));
      window.location.href = `/${data.tenant_slug}/admin`;
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || t("saasDashboard.impersonateError"));
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
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("saasDashboard.title")}</h1>
            <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 hover:bg-purple-100">
              SUPER_ADMIN
            </Badge>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t("saasDashboard.subtitle")}
            {metrics?.generated_at && (
              <span className="ml-2 text-xs">
                {t("saasDashboard.updatedAt", {
                  time: new Date(metrics.generated_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }),
                })}
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
          {t("saasDashboard.refresh")}
        </Button>
      </div>

      {metricsError && (
        <Alert variant="destructive">
          <AlertTriangle className="w-4 h-4" />
          <AlertDescription>{t("saasDashboard.loadError")}</AlertDescription>
        </Alert>
      )}

      {metrics?.past_due_list && metrics.past_due_list.length > 0 && (
        <Alert className="border-orange-200 bg-orange-50 dark:bg-orange-950/20 dark:border-orange-800">
          <AlertTriangle className="w-4 h-4 text-orange-500" />
          <AlertDescription className="text-orange-800 dark:text-orange-300">
            {t("saasDashboard.pastDueAlert", { n: fmt(metrics.past_due_list.length) })}
          </AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">{t("saasDashboard.tabs.overview")}</TabsTrigger>
          <TabsTrigger value="tenants">{t("saasDashboard.tabs.tenants")}</TabsTrigger>
          <TabsTrigger value="growth">{t("saasDashboard.tabs.growth")}</TabsTrigger>
        </TabsList>

        {/* ── Overview tab ─────────────────────────────────────────────────── */}
        <TabsContent value="overview" className="space-y-6 mt-4">
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KpiCard
              icon={DollarSign}
              label={t("saasDashboard.kpi.mrr")}
              value={metricsLoading ? "…" : fmtEUR(metrics?.mrr_eur ?? 0)}
              sub={metrics ? t("saasDashboard.kpi.arr", { value: fmtEUR(metrics.arr_eur) }) : undefined}
              color="text-green-600 dark:text-green-400"
            />
            <KpiCard
              icon={Building2}
              label={t("saasDashboard.kpi.activeTenants")}
              value={metricsLoading ? "…" : fmt(metrics?.active_tenants ?? 0)}
              sub={metrics ? t("saasDashboard.kpi.total", { n: fmt(metrics.total_tenants) }) : undefined}
            />
            <KpiCard
              icon={Zap}
              label={t("saasDashboard.kpi.trialing")}
              value={metricsLoading ? "…" : fmt(metrics?.trialing_tenants ?? 0)}
              sub={metrics ? t("saasDashboard.kpi.conversion", { pct: metrics.conversion_rate_pct }) : undefined}
              color="text-blue-600 dark:text-blue-400"
            />
            <KpiCard
              icon={AlertTriangle}
              label={t("saasDashboard.kpi.pastDue")}
              value={metricsLoading ? "…" : fmt(metrics?.past_due_tenants ?? 0)}
              color="text-orange-600 dark:text-orange-400"
              alert={(metrics?.past_due_tenants ?? 0) > 0}
            />
          </div>

          {/* Local billing row (Mobile Money / virement) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              icon={Wallet}
              label={t("saasDashboard.kpi.localMrr")}
              value={
                metricsLoading
                  ? "…"
                  : (metrics?.local_billing?.mrr_by_currency ?? [])
                      .map((m) => `${fmt(m.mrr)} ${m.currency}`)
                      .join(" + ") || "0"
              }
              sub={
                metrics?.local_billing
                  ? t("saasDashboard.kpi.activeSubscriptions", { n: fmt(metrics.local_billing.active_subscriptions) })
                  : undefined
              }
              color="text-emerald-600 dark:text-emerald-400"
            />
            <Link to="/super-admin/subscription-requests" className="block">
              <KpiCard
                icon={Hourglass}
                label={t("saasDashboard.kpi.pendingRequests")}
                value={metricsLoading ? "…" : fmt(metrics?.local_billing?.pending_requests ?? 0)}
                sub={t("saasDashboard.kpi.pendingHint")}
                color="text-amber-600 dark:text-amber-400"
                alert={(metrics?.local_billing?.pending_requests ?? 0) > 0}
              />
            </Link>
            <KpiCard
              icon={CalendarClock}
              label={t("saasDashboard.kpi.expiringSoon")}
              value={metricsLoading ? "…" : fmt(metrics?.local_billing?.expiring_soon?.length ?? 0)}
              sub={
                metrics?.local_billing?.expiring_soon?.length
                  ? metrics.local_billing.expiring_soon
                      .slice(0, 2)
                      .map((e) => e.tenant_name ?? e.tenant_slug ?? "?")
                      .join(", ")
                  : undefined
              }
              color="text-orange-600 dark:text-orange-400"
              alert={(metrics?.local_billing?.expiring_soon?.length ?? 0) > 0}
            />
          </div>

          {/* Growth + Plans row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KpiCard
              icon={TrendingUp}
              label={t("saasDashboard.kpi.new7d")}
              value={metricsLoading ? "…" : `+${fmt(metrics?.new_tenants_7d ?? 0)}`}
              sub={metrics ? t("saasDashboard.kpi.newThisMonth", { n: fmt(metrics.new_tenants_30d) }) : undefined}
              color="text-indigo-600 dark:text-indigo-400"
            />
            <KpiCard
              icon={Activity}
              label={t("saasDashboard.kpi.expiredTrials")}
              value={metricsLoading ? "…" : fmt(metrics?.expired_trials ?? 0)}
              color="text-gray-500"
            />
            <KpiCard
              icon={Users}
              label={t("saasDashboard.kpi.canceled")}
              value={metricsLoading ? "…" : fmt(metrics?.canceled_tenants ?? 0)}
              color="text-red-500 dark:text-red-400"
            />
          </div>

          {/* Plan distribution + Countries */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Plan distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("saasDashboard.planDistribution")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[...PLAN_SLUGS, "other"].map((p) => {
                  const count = metrics?.by_plan[p] ?? 0;
                  const total = metrics?.total_tenants || 1;
                  const pct = Math.round((count / total) * 100);
                  return (
                    <div key={p} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="font-medium text-gray-700 dark:text-gray-300">{p === "other" ? t("plans.other") : planLabel(t, p)}</span>
                        <span className="text-gray-500 dark:text-gray-400">
                          {metricsLoading ? "…" : `${fmt(count)} (${pct}%)`}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-800">
                        <div
                          className={`h-2 rounded-full transition-all ${
                            PLAN_BAR_COLORS[p]
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
                  {t("saasDashboard.topCountries")}
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
                    <p className="text-sm text-gray-400 dark:text-gray-500">{t("saasDashboard.noData")}</p>
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
                  {t("saasDashboard.pastDueTitle")}
                </CardTitle>
                <CardDescription>{t("saasDashboard.pastDueDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {metrics.past_due_list.map((tenant) => (
                    <div key={tenant.id} className="flex items-center justify-between rounded-lg bg-orange-50 dark:bg-orange-950/30 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{tenant.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">/{tenant.slug} · {planLabel(t, tenant.plan)}</p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={() => window.open(`/${tenant.slug}/admin/billing`, "_blank")}
                        >
                          <ExternalLink className="w-3 h-3 mr-1" />
                          {t("saasDashboard.billing")}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={() => impersonateMutation.mutate(tenant.id)}
                          disabled={impersonateMutation.isPending}
                        >
                          <LogIn className="w-3 h-3 mr-1" />
                          {t("saasDashboard.access")}
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
                placeholder={t("saasDashboard.searchPlaceholder")}
                value={tenantSearch}
                onChange={handleSearch}
              />
            </div>
            <Select value={tenantPlanFilter} onValueChange={handlePlanFilter}>
              <SelectTrigger className="w-36 h-9">
                <SelectValue placeholder={t("saasDashboard.allPlans")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("saasDashboard.allPlans")}</SelectItem>
                {PLAN_SLUGS.map((slug) => (
                  <SelectItem key={slug} value={slug}>{planLabel(t, slug)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={tenantStatusFilter} onValueChange={handleStatusFilter}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue placeholder={t("saasDashboard.allStatuses")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("saasDashboard.allStatuses")}</SelectItem>
                {["active", "trialing", "expired", "past_due", "canceled"].map((status) => (
                  <SelectItem key={status} value={status}>{t(`saasDashboard.status.${status}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("saasDashboard.table.tenant")}</TableHead>
                    <TableHead>{t("saasDashboard.table.plan")}</TableHead>
                    <TableHead>{t("saasDashboard.table.status")}</TableHead>
                    <TableHead className="text-right">{t("saasDashboard.table.users")}</TableHead>
                    <TableHead>{t("saasDashboard.table.country")}</TableHead>
                    <TableHead>{t("saasDashboard.table.createdAt")}</TableHead>
                    <TableHead className="text-right">{t("saasDashboard.table.actions")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenantsLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-400 dark:text-gray-500">
                        {t("saasDashboard.loading")}
                      </TableCell>
                    </TableRow>
                  ) : (tenantsPage?.items || []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-gray-400 dark:text-gray-500">
                        {t("saasDashboard.noTenants")}
                      </TableCell>
                    </TableRow>
                  ) : (
                    (tenantsPage?.items || []).map((tenant) => (
                      <TableRow key={tenant.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white text-sm">{tenant.name}</p>
                            <p className="text-xs text-gray-400 dark:text-gray-500">/{tenant.slug}</p>
                          </div>
                        </TableCell>
                        <TableCell><PlanBadge plan={tenant.subscription_plan} /></TableCell>
                        <TableCell><StatusBadge status={tenant.subscription_status} /></TableCell>
                        <TableCell className="text-right text-sm text-gray-600 dark:text-gray-300">
                          {fmt(tenant.user_count)}
                        </TableCell>
                        <TableCell>
                          <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{tenant.country}</span>
                        </TableCell>
                        <TableCell className="text-xs text-gray-400 dark:text-gray-500">
                          {tenant.created_at ? new Date(tenant.created_at).toLocaleDateString(locale) : "—"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => window.open(`/${tenant.slug}/admin`, "_blank")}
                              title={t("saasDashboard.viewDashboard")}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2"
                              onClick={() => impersonateMutation.mutate(tenant.id)}
                              disabled={impersonateMutation.isPending}
                              title={t("saasDashboard.tempAccess")}
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
                {t("saasDashboard.pagination", {
                  from: fmt((page - 1) * tenantsPage.page_size + 1),
                  to: fmt(Math.min(page * tenantsPage.page_size, tenantsPage.total)),
                  total: fmt(tenantsPage.total),
                })}
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
                <CardTitle className="text-base">{t("saasDashboard.signupsTitle")}</CardTitle>
                <CardDescription>{t("saasDashboard.signupsDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                {signupsChartData.length > 0 ? (
                  <MiniBarChart data={signupsChartData} label="" />
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">{t("saasDashboard.noDataAvailable")}</p>
                )}
              </CardContent>
            </Card>

            {/* Revenue trend */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("saasDashboard.mrrTitle")}</CardTitle>
                <CardDescription>{t("saasDashboard.mrrDesc")}</CardDescription>
              </CardHeader>
              <CardContent>
                {revenueChartData.length > 0 ? (
                  <MiniBarChart data={revenueChartData} label="" />
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 py-6 text-center">{t("saasDashboard.noDataAvailable")}</p>
                )}
              </CardContent>
            </Card>

            {/* Growth stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-indigo-500" />
                  {t("saasDashboard.acquisition")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  { label: t("saasDashboard.days", { n: 7 }), value: metrics?.new_tenants_7d ?? 0, color: "bg-indigo-400" },
                  { label: t("saasDashboard.days", { n: 30 }), value: metrics?.new_tenants_30d ?? 0, color: "bg-indigo-500" },
                  { label: t("saasDashboard.days", { n: 90 }), value: metrics?.new_tenants_90d ?? 0, color: "bg-indigo-600" },
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
                  {t("saasDashboard.funnel")}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  {
                    label: t("saasDashboard.funnelSignedUp"),
                    value: (metrics?.trialing_tenants ?? 0) + (metrics?.expired_trials ?? 0),
                    color: "bg-blue-400",
                  },
                  {
                    label: t("saasDashboard.funnelExpired"),
                    value: metrics?.expired_trials ?? 0,
                    color: "bg-orange-400",
                  },
                  {
                    label: t("saasDashboard.funnelConverted"),
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
                  <span className="text-gray-700 dark:text-gray-300">{t("saasDashboard.conversionRate")}</span>
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
