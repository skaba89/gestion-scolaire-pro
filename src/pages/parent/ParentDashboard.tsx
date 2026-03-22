import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useCurrency } from "@/hooks/useCurrency";
import { useRealtimeMessages } from "@/hooks/useRealtimeMessages";
import { ReminderSystem } from "@/components/reminders/ReminderSystem";
import {
  Users,
  FileText,
  CreditCard,
  MessageSquare,
  Bell,
  Calendar,
  AlertCircle,
  TrendingUp,
  Clock,
  ArrowUpRight,
  ArrowDownRight
} from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { RecentAnnouncements } from "@/components/announcements/RecentAnnouncements";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger-container";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TableSkeleton } from "@/components/ui/TableSkeleton";

// Modular Components
import { ParentDashboardHeader } from "@/components/parent/ParentDashboardHeader";
import { ParentStatsGrid } from "@/components/parent/ParentStatsGrid";
import { ParentChildGrid } from "@/components/parent/ParentChildGrid";
import { parentQueries } from "@/queries/parents";
import { AnalyticsRecommendations } from "@/components/dashboard/parent/AnalyticsRecommendations";
import { recommendationEngine } from "@/utils/recommendationEngine";
import { useEffect, useState } from "react";

import { useParentData } from "@/features/parents/hooks/useParentData";

const ParentDashboard = () => {
  const { profile, user } = useAuth();
  const { tenant } = useTenant();
  const { formatCurrency } = useCurrency();
  const { getTenantUrl } = useTenantUrl();

  // Enable real-time messages
  useRealtimeMessages();

  const {
    children,
    unpaidInvoices,
    upcomingEvents,
    notifications,
    unreadMessagesCount,
    recentGrades,
    attendanceAlerts,
    latestScans,
    totalUnpaid,
    isLoading: dataLoading,
    studentIds
  } = useParentData();

  // 9. Risk Scores & Recommendations
  const { data: riskScores, isLoading: riskLoading } = useQuery({
    queryKey: ['risk-scores', studentIds],
    queryFn: async () => {
      if (studentIds.length === 0) return [];

      const { data } = await supabase
        .from('student_risk_scores')
        .select('*')
        .in('student_id', studentIds)
        .order('calculated_at', { ascending: false });

      return data || [];
    },
    enabled: studentIds.length > 0,
  });

  // Generate recommendations
  const [recommendations, setRecommendations] = useState<any[]>([]);

  useEffect(() => {
    const loadRecommendations = async () => {
      if (!riskScores || riskScores.length === 0) return;

      const allRecs = [];
      for (const score of riskScores) {
        const recs = await recommendationEngine.generateParentRecommendations(
          score.student_id,
          score
        );
        allRecs.push(...recs);
      }

      // Sort by priority and take top 5
      setRecommendations(allRecs.sort((a, b) => b.priority - a.priority).slice(0, 5));
    };

    loadRecommendations();
  }, [riskScores]);

  const isLoading = dataLoading || riskLoading;

  const stats = [
    { href: getTenantUrl("/parent/children"), label: "Mes Enfants", icon: Users, count: children?.length || 0, color: "bg-primary/10 text-primary" },
    { href: getTenantUrl("/parent/report-cards"), label: "Bulletins", icon: FileText, count: null, color: "bg-info/10 text-info" },
    { href: getTenantUrl("/parent/invoices"), label: "Factures", icon: CreditCard, count: unpaidInvoices?.length || 0, color: totalUnpaid > 0 ? "bg-warning/10 text-warning" : "bg-success/10 text-success" },
    { href: getTenantUrl("/parent/messages"), label: "Messages", icon: MessageSquare, count: unreadMessagesCount || 0, color: "bg-secondary text-secondary-foreground" },
  ];

  if (isLoading) {
    return <TableSkeleton columns={4} rows={10} />;
  }

  return (
    <div className="space-y-6">
      <ParentDashboardHeader name={profile?.first_name || ""} childCount={children?.length || 0} />

      <ParentStatsGrid stats={stats} />

      {totalUnpaid > 0 && (
        <StaggerContainer>
          <StaggerItem>
            <Card className="border-warning/50 bg-gradient-to-r from-warning/10 to-transparent shadow-sm">
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-warning/20 flex items-center justify-center shrink-0">
                    <AlertCircle className="w-6 h-6 text-warning" />
                  </div>
                  <div className="flex-1 text-center sm:text-left">
                    <p className="font-bold text-warning font-display">Factures en attente</p>
                    <p className="text-sm text-muted-foreground">
                      Vous avez {unpaidInvoices?.length} facture(s) impayée(s) pour un total de <span className="font-bold text-foreground">{formatCurrency(totalUnpaid)}</span>
                    </p>
                  </div>
                  <Link to={getTenantUrl("/parent/invoices")}>
                    <Button variant="outline" size="sm" className="border-warning/50 text-warning hover:bg-warning hover:text-white transition-colors">
                      Payer maintenant
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          </StaggerItem>
        </StaggerContainer>
      )}

      <RecentAnnouncements />

      {recommendations.length > 0 && (
        <AnalyticsRecommendations recommendations={recommendations} />
      )}

      <ParentChildGrid children={children || []} tenantId={tenant?.id || ""} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Latest Scans (New) */}
        <Card className="border-primary/5 shadow-sm lg:col-span-2">
          <CardHeader className="bg-muted/20 border-b py-4">
            <CardTitle className="flex items-center gap-2 text-base font-display">
              <Clock className="w-5 h-5 text-primary" />
              Derniers passages enregistrés
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {latestScans?.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                <p className="text-muted-foreground text-sm font-medium">Aucun passage récent</p>
              </div>
            ) : (
              <div className="divide-y max-h-[300px] overflow-y-auto">
                {latestScans?.map((scan: any) => (
                  <div key={scan.id} className="flex items-center justify-between p-4 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        "w-10 h-10 rounded-full flex items-center justify-center",
                        scan.check_in_type === 'ENTRY' ? "bg-emerald-100 text-emerald-600" : "bg-rose-100 text-rose-600"
                      )}>
                        {scan.check_in_type === 'ENTRY' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                      </div>
                      <div>
                        <p className="font-bold text-sm">
                          {scan.students?.first_name} {scan.students?.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {scan.check_in_type === 'ENTRY' ? 'Entrée' : 'Sortie'} • {formatDistanceToNow(new Date(scan.checked_at), { addSuffix: true, locale: fr })}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn(
                      "text-[10px] uppercase font-bold",
                      scan.check_in_type === 'ENTRY' ? "border-emerald-500/50 text-emerald-600" : "border-rose-500/50 text-rose-600"
                    )}>
                      {scan.check_in_type === 'ENTRY' ? 'À l\'école' : 'Parti'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 lg:col-span-2 gap-6">
          {/* Notifications */}
          <Card className="border-primary/5 shadow-sm">
            <CardHeader className="bg-muted/20 border-b py-4">
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <Bell className="w-5 h-5 text-primary" />
                Notifications récentes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {notifications?.length === 0 ? (
                <div className="text-center py-8">
                  <Bell className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm font-medium">Aucune nouvelle notification</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications?.map((notif) => (
                    <div key={notif.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors group">
                      <div className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0 group-hover:scale-125 transition-transform" />
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-foreground/90">{notif.title}</p>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{notif.message}</p>
                        <p className="text-[10px] uppercase font-bold tracking-tighter text-primary/60 mt-2">
                          {formatDistanceToNow(new Date(notif.created_at), { addSuffix: true, locale: fr })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Upcoming Events */}
          <Card className="border-primary/5 shadow-sm">
            <CardHeader className="bg-muted/20 border-b py-4">
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <Calendar className="w-5 h-5 text-primary" />
                Événements à venir
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {upcomingEvents?.length === 0 ? (
                <div className="text-center py-8">
                  <Calendar className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm font-medium">Aucun événement prévu</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingEvents?.map((event) => (
                    <div key={event.id} className="flex items-start gap-4 p-3 rounded-xl bg-muted/30 group hover:bg-muted/50 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex flex-col items-center justify-center flex-shrink-0 group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-foreground/90">{event.title}</p>
                        <p className="text-[10px] font-bold text-primary uppercase mt-0.5">
                          {new Date(event.start_date).toLocaleDateString("fr-FR", {
                            weekday: "short",
                            day: "numeric",
                            month: "short",
                          })}
                        </p>
                        {event.description && (
                          <p className="text-xs text-muted-foreground line-clamp-1 mt-1 font-medium">
                            {event.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Grades */}
          <Card className="border-primary/5 shadow-sm">
            <CardHeader className="bg-muted/20 border-b py-4">
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <TrendingUp className="w-5 h-5 text-primary" />
                Dernières notes
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {recentGrades?.length === 0 ? (
                <div className="text-center py-8">
                  <TrendingUp className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm font-medium">Aucune note récente</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentGrades?.map((grade: any) => (
                    <div key={grade.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-foreground/90 truncate">
                          {grade.assessments?.subjects?.name}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">
                          {grade.assessments?.name} • {grade.students?.first_name}
                        </p>
                      </div>
                      <div className="text-right ml-4">
                        <span className={cn(
                          "text-lg font-bold font-display",
                          (grade.score / (grade.assessments?.max_score || 20)) * 20 >= 10 ? "text-success" : "text-destructive"
                        )}>
                          {grade.score}/{grade.assessments?.max_score || 20}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Attendance Alerts */}
          <Card className="border-primary/5 shadow-sm">
            <CardHeader className="bg-muted/20 border-b py-4">
              <CardTitle className="flex items-center gap-2 text-base font-display">
                <Clock className="w-5 h-5 text-primary" />
                Absences & Retards récents
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              {attendanceAlerts?.length === 0 ? (
                <div className="text-center py-8">
                  <Clock className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
                  <p className="text-muted-foreground text-sm font-medium">Aucun incident de présence</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {attendanceAlerts?.map((alert: any) => (
                    <div key={alert.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/30 hover:bg-muted/50 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm text-foreground/90 truncate">
                          {alert.students?.first_name} {alert.students?.last_name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(alert.date).toLocaleDateString("fr-FR", { day: "numeric", month: "long" })}
                        </p>
                      </div>
                      <div className="text-right ml-4">
                        <Badge variant="outline" className={cn(
                          "text-xs font-bold",
                          alert.status === "ABSENT" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-warning/10 text-warning border-warning/20"
                        )}>
                          {alert.status === "ABSENT" ? "Absent" : "Retard"}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reminder System */}
          <div className="lg:col-span-2">
            <ReminderSystem />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParentDashboard;
