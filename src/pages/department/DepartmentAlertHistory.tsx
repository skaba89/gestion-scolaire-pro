import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/api/client";
import { useTenant } from "@/contexts/TenantContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { Bell, Mail, AlertTriangle, CheckCircle, Clock, BarChart3 } from "lucide-react";
import { dateFnsLocale } from "@/lib/locale";
import { useTranslation } from "react-i18next";

export default function DepartmentAlertHistory() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const { user } = useAuth();

  // Get user department
  const { data: userDepartment } = useQuery({
    queryKey: ['user-department', user?.id, tenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/department-portal/members/', {
        params: { user_id: user?.id, tenant_id: tenant?.id },
      });
      return Array.isArray(data) ? data[0] ?? null : data;
    },
    enabled: !!user?.id && !!tenant?.id,
  });

  // Get alert history
  const { data: alertHistory, isLoading } = useQuery({
    queryKey: ['department-alert-history', userDepartment?.department_id, tenant?.id],
    queryFn: async () => {
      const { data } = await apiClient.get('/department-portal/alerts/', {
        params: {
          department_id: userDepartment?.department_id,
          tenant_id: tenant?.id,
          limit: 50,
        },
      });
      return Array.isArray(data) ? data : [];
    },
    enabled: !!userDepartment?.department_id && !!tenant?.id,
  });

  // Stats
  const totalAlerts = alertHistory?.length || 0;
  const emailsSent = alertHistory?.filter(a => a.email_sent).length || 0;
  const thisMonth = alertHistory?.filter(a => {
    const date = new Date(a.created_at);
    const now = new Date();
    return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
  }).length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Bell className="h-8 w-8" />
          {t("departmentPortal.alerts.title")}
        </h1>
        <p className="text-muted-foreground">
          {t("departmentPortal.departmentName", { name: (userDepartment?.departments as any)?.name || t("departmentPortal.notAssigned") })}
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("departmentPortal.alerts.total")}</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAlerts}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("departmentPortal.alerts.emailsSent")}</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{emailsSent}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">{t("departmentPortal.alerts.thisMonth")}</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{thisMonth}</div>
          </CardContent>
        </Card>
      </div>

      {/* Alert History List */}
      <Card>
        <CardHeader>
          <CardTitle>{t("departmentPortal.alerts.recent")}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">{t("departmentPortal.loading")}</div>
          ) : alertHistory?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t("departmentPortal.alerts.none")}
            </div>
          ) : (
            <div className="space-y-4">
              {alertHistory?.map((alert) => {
                const alertsData = alert.alerts_data as any[];
                
                return (
                  <div
                    key={alert.id}
                    className="border rounded-lg p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          alert.email_sent ? 'bg-green-100' : 'bg-yellow-100'
                        }`}>
                          {alert.email_sent ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-yellow-600" />
                          )}
                        </div>
                        <div>
                          <h4 className="font-medium">
                            {t("departmentPortal.alerts.attendanceAlert", { type: alert.alert_type })}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {t("departmentPortal.alerts.period", { period: alert.period_label })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant={alert.email_sent ? "default" : "secondary"}>
                          {alert.email_sent ? t("departmentPortal.alerts.emailSent") : t("departmentPortal.alerts.notSent")}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(alert.created_at), "PPp", { locale: dateFnsLocale() })}
                        </p>
                      </div>
                    </div>

                    {/* Alerts Data */}
                    {alertsData && alertsData.length > 0 && (
                      <div className="bg-muted/50 rounded-lg p-3">
                        <p className="text-sm font-medium mb-2">
                          {t("departmentPortal.alerts.classesConcerned", { count: alertsData.length })}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {alertsData.map((classAlert: any, idx: number) => (
                            <Badge 
                              key={idx} 
                              variant="outline" 
                              className="bg-red-50 text-red-700 border-red-200"
                            >
                              {classAlert.classroomName}: {classAlert.rate}%
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Recipients */}
                    <div className="flex items-center gap-4 text-sm">
                      {alert.sent_to_profile && (
                        <div className="flex items-center gap-1">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          <span>
                            {t("departmentPortal.alerts.sentTo", { name: `${(alert.sent_to_profile as any).first_name} ${(alert.sent_to_profile as any).last_name}` })}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
