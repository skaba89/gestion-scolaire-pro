import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
  DialogFooter, DialogClose
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from "@/components/ui/select";
import { toast } from "sonner";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { PLAN_SLUGS, planLabel } from "@/lib/pricing";
import {
  Building2, Search, Plus, Users, GraduationCap, CheckCircle, XCircle,
  Eye, UserPlus, Shield, ExternalLink, School, Power, Trash2, AlertTriangle, Settings,
  CreditCard, Activity,
} from "lucide-react";

interface TenantStat {
  id: string;
  name: string;
  slug: string;
  type: string;
  is_active: boolean;
  email: string | null;
  phone: string | null;
  address: string | null;
  website: string | null;
  created_at: string | null;
  student_count: number;
  user_count: number;
  admin_count: number;
  subscription_plan: string;
  subscription_status: string;
}

// Textes : superAdminTenants.* (locales).
const NS = "superAdminTenants";
const TENANT_TYPES = ["primary", "middle", "high", "university", "school", "training"];
const ADMIN_ROLES = ["TENANT_ADMIN", "DIRECTOR", "TEACHER", "STAFF", "ACCOUNTANT"];

const getTypeLabel = (t: TFunction, type: string) =>
  TENANT_TYPES.includes(type) ? t(`${NS}.types.${type}`) : type;

const getTypeBadge = (t: TFunction, type: string) => (
  <Badge variant={TENANT_TYPES.includes(type) ? "default" : "outline"}>{getTypeLabel(t, type)}</Badge>
);

const formatDateTime = (value: string, locale: string) =>
  new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });

// Le nom d'établissement est une donnée utilisateur : échappé avant que Trans
// n'analyse la phrase (sinon « <strong> » dans un nom deviendrait du balisage),
// puis restitué tel quel à l'affichage.
const boldSafe = {
  components: { b: <strong /> },
  tOptions: { interpolation: { escapeValue: true } },
  shouldUnescape: true,
};

// ─── Main Component ─────────────────────────────────────────────────────────

const SuperAdminDashboard = () => {
  const { t } = useTranslation();
  const { hasRole } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");

  const { data: tenants = [], isLoading, refetch } = useQuery<TenantStat[]>({
    queryKey: ["super-admin-tenants"],
    queryFn: async () => {
      const { data } = await apiClient.get("/tenants/super-admin/stats/");
      return data;
    },
  });

  if (!hasRole("SUPER_ADMIN")) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Shield className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">{t(`${NS}.accessDenied`)}</h2>
            <p className="text-muted-foreground">{t(`${NS}.accessDeniedText`)}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const filteredTenants = tenants.filter((tenant) =>
    tenant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tenant.slug.toLowerCase().includes(searchTerm.toLowerCase()) ||
    tenant.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalStudents = tenants.reduce((a, tenant) => a + tenant.student_count, 0);
  const totalUsers = tenants.reduce((a, tenant) => a + tenant.user_count, 0);
  const activeCount = tenants.filter((tenant) => tenant.is_active).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="w-6 h-6 text-primary" />
            {t(`${NS}.title`)}
          </h1>
          <p className="text-muted-foreground">
            {t(`${NS}.subtitle`)}
          </p>
        </div>
        <Button onClick={() => navigate("/super-admin/create-tenant")}>
          <Plus className="w-4 h-4 mr-2" />
          {t(`${NS}.newTenant`)}
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{tenants.length}</p>
                <p className="text-xs text-muted-foreground">{t(`${NS}.stats.tenants`)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{activeCount}</p>
                <p className="text-xs text-muted-foreground">{t(`${NS}.stats.active`)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <Users className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalUsers}</p>
                <p className="text-xs text-muted-foreground">{t(`${NS}.stats.users`)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-purple-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{totalStudents}</p>
                <p className="text-xs text-muted-foreground">{t(`${NS}.stats.students`)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Empty state */}
      {!isLoading && tenants.length === 0 && (
        <Card className="text-center py-16">
          <CardContent>
            <School className="w-16 h-16 text-muted-foreground/30 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">{t(`${NS}.emptyTitle`)}</h2>
            <p className="text-muted-foreground mb-6">
              {t(`${NS}.emptyText`)}
            </p>
            <Button onClick={() => navigate("/super-admin/create-tenant")}>
              <Plus className="w-4 h-4 mr-2" />
              {t(`${NS}.createTenant`)}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Search + Table */}
      {tenants.length > 0 && (
        <>
          <Card>
            <CardContent className="p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder={t(`${NS}.searchPlaceholder`)}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                {t(`${NS}.listTitle`, { n: filteredTenants.length })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">{t(`${NS}.loading`)}</div>
              ) : filteredTenants.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">{t(`${NS}.noResults`)}</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {(["name", "type", "slug", "admins", "users", "students", "subscription", "status"] as const).map((col) => (
                          <TableHead key={col}>{t(`${NS}.table.${col}`)}</TableHead>
                        ))}
                        <TableHead className="text-right">{t(`${NS}.table.actions`)}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTenants.map((tenant) => (
                        <TableRow key={tenant.id}>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                                <Building2 className="w-4 h-4 text-primary" />
                              </div>
                              <div>
                                <p className="font-medium">{tenant.name}</p>
                                {tenant.email && (
                                  <p className="text-xs text-muted-foreground">{tenant.email}</p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{getTypeBadge(t, tenant.type)}</TableCell>
                          <TableCell>
                            <code className="text-xs bg-muted px-2 py-1 rounded">{tenant.slug}</code>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{tenant.admin_count}</Badge>
                          </TableCell>
                          <TableCell>{tenant.user_count}</TableCell>
                          <TableCell>{tenant.student_count}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{planLabel(t, tenant.subscription_plan)}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={tenant.is_active ? "default" : "secondary"}>
                              {tenant.is_active ? t(`${NS}.active`) : t(`${NS}.inactive`)}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => navigate(`/super-admin/tenants/${tenant.id}/settings`)}
                                title={t(`${NS}.settings`)}
                              >
                                <Settings className="w-4 h-4" />
                              </Button>
                              <TenantDetailDialog tenant={tenant} />
                              <TenantHealthDialog tenant={tenant} />
                              <AddAdminDialog tenant={tenant} onSuccess={() => refetch()} />
                              <TenantSubscriptionDialog tenant={tenant} onSuccess={() => refetch()} />
                              <TenantToggleDialog tenant={tenant} onSuccess={() => refetch()} />
                              <TenantDeleteDialog tenant={tenant} onSuccess={() => refetch()} />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  window.open(
                                    window.location.origin + `/${tenant.slug}/admin`,
                                    "_blank",
                                    "noopener"
                                  );
                                }}
                                title={t(`${NS}.openTenant`)}
                              >
                                <ExternalLink className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

// ─── Tenant Detail Dialog ────────────────────────────────────────────────────

function TenantDetailDialog({ tenant }: { tenant: TenantStat }) {
  const { t, i18n } = useTranslation();
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost">
          <Eye className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            {tenant.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <Users className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">{tenant.user_count}</p>
                <p className="text-xs text-muted-foreground">{t(`${NS}.detail.users`)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <GraduationCap className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">{tenant.student_count}</p>
                <p className="text-xs text-muted-foreground">{t(`${NS}.detail.students`)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <Shield className="w-6 h-6 mx-auto mb-2 text-primary" />
                <p className="text-2xl font-bold">{tenant.admin_count}</p>
                <p className="text-xs text-muted-foreground">{t(`${NS}.detail.admins`)}</p>
              </CardContent>
            </Card>
          </div>
          <div className="space-y-2 text-sm">
            <p><strong>{t(`${NS}.detail.type`)}:</strong> {getTypeLabel(t, tenant.type)}</p>
            <p><strong>{t(`${NS}.detail.slug`)}:</strong> <code className="bg-muted px-2 py-0.5 rounded">{tenant.slug}</code></p>
            <p><strong>{t(`${NS}.detail.email`)}:</strong> {tenant.email || "-"}</p>
            <p><strong>{t(`${NS}.detail.phone`)}:</strong> {tenant.phone || "-"}</p>
            <p><strong>{t(`${NS}.detail.address`)}:</strong> {tenant.address || "-"}</p>
            <p><strong>{t(`${NS}.detail.website`)}:</strong> {tenant.website || "-"}</p>
            <p><strong>{t(`${NS}.detail.status`)}:</strong> {tenant.is_active ? t(`${NS}.active`) : t(`${NS}.inactive`)}</p>
            {tenant.created_at && (
              <p><strong>{t(`${NS}.detail.createdAt`)}:</strong> {formatDateTime(tenant.created_at, i18n.language)}</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tenant Health Dialog (dashboard support tenant) ─────────────────────────
// Consumes GET /platform/tenants/{id}/health/ — quota usage, recent failed
// jobs, last import, last failed payment webhook, overall status. Fetched
// lazily (enabled: open) so listing tenants never triggers N health queries.

const HEALTH_STATUS_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  healthy: "default",
  degraded: "secondary",
  critical: "destructive",
  inactive: "outline",
};

function TenantHealthDialog({ tenant }: { tenant: TenantStat }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["tenant-health", tenant.id],
    queryFn: async () => {
      const { data } = await apiClient.get(`/platform/tenants/${tenant.id}/health/`);
      return data;
    },
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title={t(`${NS}.health.button`)}>
          <Activity className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-5 h-5" />
            {t(`${NS}.health.title`, { name: tenant.name })}
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">{t(`${NS}.loading`)}</div>
        ) : isError ? (
          <div className="text-center py-8 text-destructive">{t(`${NS}.health.error`)}</div>
        ) : data ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t(`${NS}.health.overall`)}</span>
              <Badge variant={HEALTH_STATUS_VARIANT[data.overall_status] || "outline"}>
                {HEALTH_STATUS_VARIANT[data.overall_status]
                  ? t(`${NS}.health.status.${data.overall_status}`)
                  : data.overall_status}
              </Badge>
            </div>

            {data.quota?.quotas && (
              <div className="space-y-1.5">
                <p className="text-sm font-medium">{t(`${NS}.health.quotas`)}</p>
                {data.quota.quotas.map((q: any) => (
                  <div key={q.resource} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{q.resource}</span>
                    <span className={q.warning ? "text-amber-600 font-medium" : ""}>
                      {q.used}{q.limit !== null ? ` / ${q.limit}` : ` ${t(`${NS}.health.unlimited`)}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-1 text-sm">
              <p>
                <strong>{t(`${NS}.health.failedJobs`)}</strong>{" "}
                {data.failed_jobs_recent?.length || 0}
              </p>
              {data.failed_jobs_recent?.slice(0, 3).map((j: any) => (
                <p key={j.id} className="text-xs text-muted-foreground pl-3">
                  {j.job_type} — {j.error || t(`${NS}.health.unknownError`)}
                </p>
              ))}
            </div>

            <div className="space-y-1 text-sm">
              <p>
                <strong>{t(`${NS}.health.lastImport`)}</strong>{" "}
                {data.last_import
                  ? `${data.last_import.action} (${formatDateTime(data.last_import.created_at, i18n.language)})`
                  : t(`${NS}.health.none`)}
              </p>
              <p>
                <strong>{t(`${NS}.health.lastWebhook`)}</strong>{" "}
                {data.last_failed_payment_webhook
                  ? `${data.last_failed_payment_webhook.gateway} — ${data.last_failed_payment_webhook.reason || t(`${NS}.health.noDetail`)}`
                  : data.last_failed_payment_webhook_note || t(`${NS}.health.none`)}
              </p>
              <p>
                <strong>{t(`${NS}.health.lastActivity`)}</strong>{" "}
                {data.last_activity_at
                  ? formatDateTime(data.last_activity_at, i18n.language)
                  : t(`${NS}.health.none`)}
              </p>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Admin Dialog ────────────────────────────────────────────────────────

function AddAdminDialog({ tenant, onSuccess }: { tenant: TenantStat; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [role, setRole] = useState("TENANT_ADMIN");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !firstName || !lastName) {
      toast.error(t(`${NS}.addAdmin.fillAll`));
      return;
    }
    setLoading(true);
    try {
      // No password field by design — SUPER_ADMIN never sets or sees this
      // account's credential, only triggers an emailed activation link
      // (see create_tenant_admin_user() in the backend).
      await apiClient.post(`/tenants/${tenant.id}/create-admin/`, {
        email,
        first_name: firstName,
        last_name: lastName,
        role,
      });
      toast.success(t(`${NS}.addAdmin.created`, { email }));
      setOpen(false);
      setEmail("");
      setFirstName("");
      setLastName("");
      onSuccess();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || t(`${NS}.addAdmin.createError`);
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title={t(`${NS}.addAdmin.button`)}>
          <UserPlus className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            {t(`${NS}.addAdmin.title`, { name: tenant.name })}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t(`${NS}.addAdmin.firstName`)}</Label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label>{t(`${NS}.addAdmin.lastName`)}</Label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t(`${NS}.addAdmin.email`)}</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>{t(`${NS}.addAdmin.role`)}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADMIN_ROLES.map((r) => (
                  <SelectItem key={r} value={r}>{t(`${NS}.addAdmin.roles.${r}`)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(`${NS}.addAdmin.note`)}
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">{t(`${NS}.cancel`)}</Button>
            </DialogClose>
            <Button type="submit" disabled={loading}>
              {loading ? t(`${NS}.addAdmin.sending`) : t(`${NS}.addAdmin.submit`)}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tenant Subscription Dialog ─────────────────────────────────────────────
// Grille du 2026-10-26, pas d'offre gratuite : le backend (PATCH
// /platform/tenants/{id}/subscription/) n'accepte que standard / medium /
// premium / enterprise, cette liste en est le miroir.

function TenantSubscriptionDialog({ tenant, onSuccess }: { tenant: TenantStat; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [plan, setPlan] = useState(tenant.subscription_plan);

  const handleSave = async () => {
    if (plan === tenant.subscription_plan) {
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      await apiClient.patch(`/platform/tenants/${tenant.id}/subscription/`, { plan });
      toast.success(t(`${NS}.subscription.updated`, { name: tenant.name, plan: planLabel(t, plan) }));
      setOpen(false);
      onSuccess();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || t(`${NS}.subscription.error`);
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setPlan(tenant.subscription_plan);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title={t(`${NS}.subscription.title`)}>
          <CreditCard className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            {t(`${NS}.subscription.title`)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            <p><strong>{t(`${NS}.subscription.tenant`)}</strong> {tenant.name}</p>
            <p><strong>{t(`${NS}.subscription.current`)}</strong> {planLabel(t, tenant.subscription_plan)}</p>
          </div>
          <div className="space-y-2">
            <Label>{t(`${NS}.subscription.next`)}</Label>
            <Select value={plan} onValueChange={setPlan}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLAN_SLUGS.map((slug) => (
                  <SelectItem key={slug} value={slug}>
                    {planLabel(t, slug)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t(`${NS}.cancel`)}</Button>
          </DialogClose>
          <Button onClick={handleSave} disabled={loading}>
            {loading ? t(`${NS}.subscription.saving`) : t(`${NS}.subscription.save`)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tenant Toggle Status Dialog ────────────────────────────────────────────

function TenantToggleDialog({ tenant, onSuccess }: { tenant: TenantStat; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    try {
      await apiClient.patch(`/tenants/${tenant.id}/toggle-status/`);
      toast.success(
        tenant.is_active
          ? t(`${NS}.toggle.deactivated`, { name: tenant.name })
          : t(`${NS}.toggle.reactivated`, { name: tenant.name })
      );
      setOpen(false);
      onSuccess();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || t(`${NS}.toggle.error`);
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          title={tenant.is_active ? t(`${NS}.toggle.deactivateTitle`) : t(`${NS}.toggle.reactivateTitle`)}
        >
          <Power className={`w-4 h-4 ${tenant.is_active ? "text-orange-500" : "text-green-500"}`} />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Power className={`w-5 h-5 ${tenant.is_active ? "text-orange-500" : "text-green-500"}`} />
            {tenant.is_active ? t(`${NS}.toggle.deactivateTitle`) : t(`${NS}.toggle.reactivateTitle`)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {tenant.is_active ? (
            <>
              <div className="flex items-start gap-3 p-4 bg-orange-50 dark:bg-orange-950/30 rounded-lg border border-orange-200 dark:border-orange-800">
                <AlertTriangle className="w-5 h-5 text-orange-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-orange-800 dark:text-orange-200">{t(`${NS}.toggle.warning`)}</p>
                  <p className="text-orange-700 dark:text-orange-300 mt-1">
                    <Trans i18nKey={`${NS}.toggle.warningText`} values={{ name: tenant.name }} {...boldSafe} />
                  </p>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                <p><strong>{t(`${NS}.toggle.tenant`)}</strong> {tenant.name}</p>
                <p><strong>{t(`${NS}.toggle.usersAffected`)}</strong> {tenant.user_count}</p>
                <p><strong>{t(`${NS}.toggle.studentsAffected`)}</strong> {tenant.student_count}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                {t(`${NS}.toggle.reactivateLater`)}
              </p>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">
              <p>
                <Trans i18nKey={`${NS}.toggle.reactivateText`} values={{ name: tenant.name }} {...boldSafe} />
              </p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t(`${NS}.cancel`)}</Button>
            <Button
              variant={tenant.is_active ? "destructive" : "default"}
              disabled={loading}
              onClick={handleToggle}
            >
              {loading
                ? t(`${NS}.loading`)
                : tenant.is_active
                  ? t(`${NS}.toggle.deactivate`)
                  : t(`${NS}.toggle.reactivate`)}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tenant Delete Dialog ────────────────────────────────────────────────────

function TenantDeleteDialog({ tenant, onSuccess }: { tenant: TenantStat; onSuccess: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [confirmStep, setConfirmStep] = useState(0); // 0 = not confirmed, 1 = first confirm, 2 = second confirm
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      await apiClient.delete(`/tenants/${tenant.id}/`);
      toast.success(t(`${NS}.remove.deleted`, { name: tenant.name }));
      setOpen(false);
      setConfirmStep(0);
      onSuccess();
    } catch (err: any) {
      const detail = err?.response?.data?.detail || t(`${NS}.remove.error`);
      toast.error(detail);
    } finally {
      setLoading(false);
    }
  };

  const resetAndClose = () => {
    setOpen(false);
    setConfirmStep(0);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetAndClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" title={t(`${NS}.remove.title`)}>
          <Trash2 className="w-4 h-4 text-red-500" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-500" />
            {t(`${NS}.remove.title`)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {confirmStep === 0 && (
            <>
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-red-800 dark:text-red-200">{t(`${NS}.remove.irreversible`)}</p>
                  <p className="text-red-700 dark:text-red-300 mt-1">
                    <Trans i18nKey={`${NS}.remove.irreversibleText`} values={{ name: tenant.name }} {...boldSafe} />
                  </p>
                </div>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <p><strong>{t(`${NS}.remove.tenant`)}</strong> {tenant.name}</p>
                <p><strong>{t(`${NS}.remove.users`)}</strong> {tenant.user_count}</p>
                <p><strong>{t(`${NS}.remove.students`)}</strong> {tenant.student_count}</p>
              </div>
              <ul className="text-sm text-red-600 dark:text-red-400 list-disc list-inside space-y-1">
                {(["users", "grades", "payments", "attendance", "messages"] as const).map((item) => (
                  <li key={item}>{t(`${NS}.remove.items.${item}`)}</li>
                ))}
              </ul>
              <Button
                variant="destructive"
                className="w-full"
                onClick={() => setConfirmStep(1)}
              >
                {t(`${NS}.remove.understand`)}
              </Button>
            </>
          )}
          {confirmStep === 1 && (
            <>
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-300">
                  {t(`${NS}.remove.typeName`)}
                </p>
              </div>
              <div className="space-y-2">
                <Label>
                  <Trans i18nKey={`${NS}.remove.typeLabel`} values={{ name: tenant.name }} {...boldSafe} />
                </Label>
                <Input
                  placeholder={tenant.name}
                  onChange={(e) => {
                    if (e.target.value === tenant.name) setConfirmStep(2);
                    else setConfirmStep(1);
                  }}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetAndClose}>{t(`${NS}.cancel`)}</Button>
              </DialogFooter>
            </>
          )}
          {confirmStep === 2 && (
            <>
              <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800">
                <AlertTriangle className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
                <p className="text-sm font-medium text-red-700 dark:text-red-300">
                  {t(`${NS}.remove.lastChance`)}
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={resetAndClose}>{t(`${NS}.cancel`)}</Button>
                <Button
                  variant="destructive"
                  disabled={loading}
                  onClick={handleDelete}
                >
                  {loading ? t(`${NS}.remove.deleting`) : t(`${NS}.remove.confirm`)}
                </Button>
              </DialogFooter>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default SuperAdminDashboard;
