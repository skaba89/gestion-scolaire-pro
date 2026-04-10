import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  BarChart3,
  ClipboardCheck,
  Calendar,
  BookOpen,
  School,
  FileText,
} from "lucide-react";
import { Link } from "react-router-dom";
import { TeacherDashboardCharts } from "@/components/dashboard/TeacherDashboardCharts";
import { RecentAnnouncements } from "@/components/announcements/RecentAnnouncements";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { useTeacherData } from "@/features/staff/hooks/useStaff";
import { useGrades } from "@/features/grades/hooks/useGrades";
import { StaggerContainer, StaggerItem } from "@/components/ui/stagger-container";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useQuery } from "@tanstack/react-query";
import { dashboardQueries } from "@/queries/dashboard";

// Modular Components
import { TeacherDashboardHeader } from "@/components/teacher/TeacherDashboardHeader";
import { TeacherQuickActions } from "@/components/teacher/TeacherQuickActions";
import { TeacherTodaySchedule } from "@/components/teacher/TeacherTodaySchedule";

const TeacherDashboard = () => {
  const { user, profile } = useAuth();
  const { tenant } = useTenant();
  const { getTenantUrl } = useTenantUrl();

  const {
    assignedClassrooms,
    assignedSubjects,
    schedule,
    isLoading: dataLoading
  } = useTeacherData();

  const {
    assessments,
    isLoading: gradesLoading
  } = useGrades();

  // Get today's schedule
  const today = new Date().getDay(); // 0=Sunday, 1=Monday, etc.
  const todaySchedule = schedule?.filter(slot => slot.day_of_week === today) || [];

  // Get recent assessments (limit 5)
  const recentAssessments = (assessments || []).slice(0, 5);

  // Get pending homework submissions to grade
  const { data: stats, isLoading: statsLoading } = useQuery({
    ...dashboardQueries.teacherStats(user?.id || "", tenant?.id || ""),
    enabled: !!user?.id && !!tenant?.id,
  });

  const isLoading = dataLoading || gradesLoading || statsLoading;

  const quickActions = [
    { href: getTenantUrl("/teacher/classes"), label: "Mes Classes", icon: School, count: (assignedClassrooms || []).length },
    { href: getTenantUrl("/teacher/grades"), label: "Notes", icon: BarChart3, count: (assessments || []).length },
    { href: getTenantUrl("/teacher/homework"), label: "Devoirs à noter", icon: FileText, count: stats?.pendingHomework || 0 },
    { href: getTenantUrl("/teacher/attendance"), label: "Présences", icon: ClipboardCheck, count: 0 },
  ];

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-32 w-full animate-pulse bg-primary/10 rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="animate-pulse h-24 bg-muted" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TableSkeleton columns={2} rows={5} />
          <TableSkeleton columns={2} rows={5} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <TeacherDashboardHeader teacherName={profile?.first_name || "Professeur"} />

      <TeacherQuickActions actions={quickActions} />

      {/* My Assignments Summary */}
      {(assignedClassrooms || []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="w-5 h-5" />
              Mes Assignations
            </CardTitle>
          </CardHeader>
          <CardContent>
            <StaggerContainer className="flex flex-wrap gap-2">
              {(assignedClassrooms || []).map((cls, idx) => (
                <StaggerItem key={cls.id} index={idx}>
                  <Badge variant="outline" className="gap-1">
                    <School className="w-3 h-3" />
                    {cls.name}
                  </Badge>
                </StaggerItem>
              ))}
              {(assignedSubjects || []).map((sub, idx) => (
                <StaggerItem key={sub.id} index={idx + (assignedClassrooms || []).length}>
                  <Badge variant="secondary" className="gap-1">
                    <BookOpen className="w-3 h-3" />
                    {sub.name}
                  </Badge>
                </StaggerItem>
              ))}
            </StaggerContainer>
          </CardContent>
        </Card>
      )}

      {/* Announcements */}
      <RecentAnnouncements />

      {/* Charts Section */}
      <TeacherDashboardCharts />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <TeacherTodaySchedule schedule={todaySchedule} />

        {/* Recent Assessments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Évaluations Récentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {recentAssessments.length === 0 ? (
              <div className="text-center py-8">
                <BarChart3 className="w-12 h-12 text-muted-foreground/50 mx-auto mb-4" />
                <p className="text-muted-foreground">Aucune évaluation créée</p>
                <Link to={getTenantUrl("/teacher/grades")} className="text-primary hover:underline text-sm">
                  Créer une évaluation
                </Link>
              </div>
            ) : (
              <StaggerContainer className="space-y-3">
                {recentAssessments.map((assessment, idx) => (
                  <StaggerItem key={assessment.id} index={idx}>
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-transparent hover:border-primary/20 transition-colors">
                      <div>
                        <p className="font-medium">{assessment.name}</p>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>{assessment.subjects?.name}</span>
                          <span>•</span>
                          <span>{assessment.class_id}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">/{assessment.max_score}</p>
                        <p className="text-xs text-muted-foreground uppercase">{assessment.type}</p>
                      </div>
                    </div>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default TeacherDashboard;
