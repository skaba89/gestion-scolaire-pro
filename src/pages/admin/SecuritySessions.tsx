import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isAxiosError } from "axios";
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Lock,
  LogOut,
  MapPin,
  Monitor,
  RefreshCw,
  Search,
  Shield,
  Smartphone,
  Tablet,
  XCircle,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  type ActiveSession,
  type AuthEvent,
  getActiveSessions,
  getAuthHistory,
  terminateSession,
} from "@/hooks/useLoginTracking";

type TimeFilter = "7d" | "30d" | "all";

const DAY_MS = 86_400_000;
const BRUTE_FORCE_THRESHOLD = 3;

function DeviceIcon({ type }: { type: ActiveSession["device_type"] }) {
  if (type === "mobile") return <Smartphone className="h-4 w-4" aria-hidden="true" />;
  if (type === "tablet") return <Tablet className="h-4 w-4" aria-hidden="true" />;
  return <Monitor className="h-4 w-4" aria-hidden="true" />;
}

function isForbidden(error: unknown): boolean {
  return isAxiosError(error) && error.response?.status === 403;
}

const SecuritySessions = () => {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("7d");
  const [confirmOthers, setConfirmOthers] = useState(false);

  const dateTime = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }),
    [i18n.language],
  );
  const dayLabel = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { day: "2-digit", month: "short" }),
    [i18n.language],
  );

  const sessionsQuery = useQuery({ queryKey: ["auth-sessions"], queryFn: getActiveSessions });
  const historyQuery = useQuery({
    queryKey: ["auth-history"],
    queryFn: getAuthHistory,
    retry: (count, error) => !isForbidden(error) && count < 2,
  });

  const sessions = sessionsQuery.data ?? [];
  const otherSessions = sessions.filter((s) => !s.is_current);

  const revokeMutation = useMutation({
    mutationFn: terminateSession,
    onSuccess: () => {
      toast({ title: t("securitySessions.toast.revokedTitle"), description: t("securitySessions.toast.revokedBody") });
    },
    onError: () => {
      toast({
        title: t("securitySessions.toast.errorTitle"),
        description: t("securitySessions.toast.errorBody"),
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["auth-sessions"] });
      queryClient.invalidateQueries({ queryKey: ["auth-history"] });
    },
  });

  const revokeOthers = async () => {
    setConfirmOthers(false);
    const results = await Promise.allSettled(otherSessions.map((s) => terminateSession(s.id)));
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.length - ok;
    queryClient.invalidateQueries({ queryKey: ["auth-sessions"] });
    queryClient.invalidateQueries({ queryKey: ["auth-history"] });
    toast({
      title: failed === 0 ? t("securitySessions.toast.othersRevokedTitle") : t("securitySessions.toast.errorTitle"),
      description: t("securitySessions.toast.othersRevokedBody", { ok, failed }),
      variant: failed === 0 ? "default" : "destructive",
    });
  };

  const history = useMemo(() => {
    const all = historyQuery.data ?? [];
    const since =
      timeFilter === "7d" ? Date.now() - 7 * DAY_MS : timeFilter === "30d" ? Date.now() - 30 * DAY_MS : 0;
    const term = searchTerm.trim().toLowerCase();
    return all.filter((e) => {
      if (new Date(e.created_at).getTime() < since) return false;
      if (!term) return true;
      return [e.ip_address, e.browser, e.os, e.login, e.action]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [historyQuery.data, timeFilter, searchTerm]);

  const loginAttempts = history.filter((e) => e.success || e.failure);
  const successCount = history.filter((e) => e.success).length;
  const failureCount = history.filter((e) => e.failure).length;

  const suspicious = useMemo(() => {
    const byIp = new Map<string, number>();
    history.filter((e) => e.failure).forEach((e) => {
      const ip = e.ip_address || "?";
      byIp.set(ip, (byIp.get(ip) ?? 0) + 1);
    });
    return [...byIp.entries()].filter(([, n]) => n >= BRUTE_FORCE_THRESHOLD);
  }, [history]);

  const chartData = useMemo(() => {
    const days = timeFilter === "7d" ? 7 : 30;
    const buckets = new Map<string, { date: string; success: number; failed: number }>();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY_MS);
      buckets.set(d.toDateString(), { date: dayLabel.format(d), success: 0, failed: 0 });
    }
    history.forEach((e) => {
      const bucket = buckets.get(new Date(e.created_at).toDateString());
      if (!bucket) return;
      if (e.success) bucket.success++;
      if (e.failure) bucket.failed++;
    });
    return [...buckets.values()];
  }, [history, timeFilter, dayLabel]);

  const actionLabel = (e: AuthEvent) =>
    t(`securitySessions.actions.${e.action}`, { defaultValue: e.action });

  const deviceLabel = (s: { browser: string | null; os: string | null }) =>
    s.browser && s.os
      ? t("securitySessions.sessions.browserOn", { browser: s.browser, os: s.os })
      : t("securitySessions.unknownDevice");

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-2">
            <Shield className="h-8 w-8 text-primary" aria-hidden="true" />
            {t("securitySessions.title")}
          </h1>
          <p className="text-muted-foreground mt-1">{t("securitySessions.subtitle")}</p>
        </div>
        <div className="flex gap-2">
          <select
            aria-label={t("securitySessions.period.label")}
            className="px-3 py-2 border rounded-md bg-background text-sm"
            value={timeFilter}
            onChange={(e) => setTimeFilter(e.target.value as TimeFilter)}
          >
            <option value="7d">{t("securitySessions.period.7d")}</option>
            <option value="30d">{t("securitySessions.period.30d")}</option>
            <option value="all">{t("securitySessions.period.all")}</option>
          </select>
          <Button
            variant="outline"
            onClick={() => {
              sessionsQuery.refetch();
              historyQuery.refetch();
            }}
          >
            <RefreshCw className="h-4 w-4 me-2" aria-hidden="true" />
            {t("securitySessions.refresh")}
          </Button>
        </div>
      </div>

      {suspicious.length > 0 && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              {t("securitySessions.suspicious.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {suspicious.map(([ip, count]) => (
                <li key={ip} className="flex items-center gap-2 text-sm">
                  <Lock className="h-4 w-4 text-destructive" aria-hidden="true" />
                  <span>{t("securitySessions.suspicious.item", { count, ip })}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: t("securitySessions.stats.activeSessions"), value: sessions.length, icon: Activity },
          { label: t("securitySessions.stats.successful"), value: successCount, icon: CheckCircle },
          { label: t("securitySessions.stats.failed"), value: failureCount, icon: XCircle },
          {
            label: t("securitySessions.stats.successRate"),
            value: loginAttempts.length ? `${Math.round((successCount / loginAttempts.length) * 100)} %` : "—",
            icon: Shield,
          },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardContent className="pt-6 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{label}</p>
                <p className="text-2xl font-bold">{value}</p>
              </div>
              <Icon className="h-6 w-6 text-primary" aria-hidden="true" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="sessions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sessions">{t("securitySessions.tabs.sessions")}</TabsTrigger>
          <TabsTrigger value="history">{t("securitySessions.tabs.history")}</TabsTrigger>
        </TabsList>

        <TabsContent value="sessions">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>{t("securitySessions.sessions.title")}</CardTitle>
                  <CardDescription>{t("securitySessions.sessions.description")}</CardDescription>
                </div>
                {otherSessions.length > 0 && (
                  <Button variant="destructive" size="sm" onClick={() => setConfirmOthers(true)}>
                    <LogOut className="h-4 w-4 me-2" aria-hidden="true" />
                    {t("securitySessions.sessions.revokeOthers")}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {sessionsQuery.isLoading ? (
                <p className="text-center py-8 text-muted-foreground">{t("securitySessions.sessions.loading")}</p>
              ) : sessionsQuery.isError ? (
                <p role="alert" className="text-center py-8 text-destructive">
                  {t("securitySessions.sessions.error")}
                </p>
              ) : sessions.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">{t("securitySessions.sessions.empty")}</p>
              ) : (
                <ul className="space-y-4">
                  {sessions.map((session) => (
                    <li
                      key={session.id}
                      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-muted rounded-full">
                          <DeviceIcon type={session.device_type} />
                        </div>
                        <div>
                          <p className="font-medium">{deviceLabel(session)}</p>
                          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" aria-hidden="true" />
                            <span>{session.ip_address || t("securitySessions.unknownIp")}</span>
                            <span aria-hidden="true">•</span>
                            <Clock className="h-3 w-3" aria-hidden="true" />
                            <span>
                              {t("securitySessions.sessions.lastActivity", {
                                date: dateTime.format(new Date(session.last_activity_at)),
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {session.is_current ? (
                          <Badge variant="secondary">{t("securitySessions.sessions.current")}</Badge>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => revokeMutation.mutate(session.id)}
                            disabled={revokeMutation.isPending}
                          >
                            <LogOut className="h-4 w-4 me-1" aria-hidden="true" />
                            {t("securitySessions.sessions.revoke")}
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{t("securitySessions.chart.title")}</CardTitle>
              <CardDescription>{t("securitySessions.chart.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="date" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="success" name={t("securitySessions.chart.success")} stroke="hsl(142, 76%, 36%)" strokeWidth={2} />
                    <Line type="monotone" dataKey="failed" name={t("securitySessions.chart.failed")} stroke="hsl(0, 84%, 60%)" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>{t("securitySessions.history.title")}</CardTitle>
                  <CardDescription>{t("securitySessions.history.description")}</CardDescription>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <Input
                    aria-label={t("securitySessions.history.search")}
                    placeholder={t("securitySessions.history.search")}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="ps-10"
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {historyQuery.isLoading ? (
                <p className="text-center py-8 text-muted-foreground">{t("securitySessions.history.loading")}</p>
              ) : historyQuery.isError ? (
                <p role="alert" className="text-center py-8 text-destructive">
                  {isForbidden(historyQuery.error)
                    ? t("securitySessions.history.forbidden")
                    : t("securitySessions.history.error")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("securitySessions.history.date")}</TableHead>
                        <TableHead>{t("securitySessions.history.event")}</TableHead>
                        <TableHead>{t("securitySessions.history.account")}</TableHead>
                        <TableHead>{t("securitySessions.history.device")}</TableHead>
                        <TableHead>{t("securitySessions.history.ip")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {history.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground">
                            {t("securitySessions.history.empty")}
                          </TableCell>
                        </TableRow>
                      ) : (
                        history.map((entry) => (
                          <TableRow key={entry.id}>
                            <TableCell>{dateTime.format(new Date(entry.created_at))}</TableCell>
                            <TableCell>
                              <Badge variant={entry.failure ? "destructive" : "secondary"}>{actionLabel(entry)}</Badge>
                            </TableCell>
                            <TableCell>{entry.login || "—"}</TableCell>
                            <TableCell>
                              <span className="flex items-center gap-2">
                                <DeviceIcon type={entry.device_type} />
                                {deviceLabel(entry)}
                              </span>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{entry.ip_address || "—"}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={confirmOthers} onOpenChange={setConfirmOthers}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("securitySessions.confirmOthers.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("securitySessions.confirmOthers.body", { count: otherSessions.length })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("securitySessions.confirmOthers.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={revokeOthers}>{t("securitySessions.confirmOthers.confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SecuritySessions;
