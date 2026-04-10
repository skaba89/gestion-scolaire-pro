import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import {
  FileText,
  Calendar,
  MessageSquare,
  TrendingUp,
  BookOpen,
  ClipboardList,
  Clock
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ReminderSystem } from "@/components/reminders/ReminderSystem";
import { SharedNotes } from "@/components/collaboration/SharedNotes";
import { CollaborativeTools } from "@/components/collaboration/CollaborativeTools";
import { useTenantUrl } from "@/hooks/useTenantUrl";
import { useStudentLabel } from "@/hooks/useStudentLabel";
import { useStudentData } from "@/features/students/hooks/useStudentData";

// Modular Components
import { StudentDashboardHeader } from "@/components/student/StudentDashboardHeader";
import { StudentStatsGrid } from "@/components/student/StudentStatsGrid";
import { StudentQuickLinks } from "@/components/student/StudentQuickLinks";
import { StudentUpcomingHomework } from "@/components/student/StudentUpcomingHomework";
import { StudentTodaySchedule } from "@/components/student/StudentTodaySchedule";
import { StudentRecentGrades } from "@/components/student/StudentRecentGrades";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { StudentDigitalBadge } from "@/components/student/StudentDigitalBadge";
import { CheckInHistoryList } from "@/components/attendance/CheckInHistoryList";

const StudentDashboard = () => {
  const { user } = useAuth();
  const { tenant } = useTenant();
  const { StudentLabel, studentsLabel } = useStudentLabel();
  const { getTenantUrl } = useTenantUrl();

  const {
    student,
    enrollment,
    grades: recentGrades,
    homework,
    schedule: fullSchedule,
    checkInHistory,
    isLoading: isDataLoading,
  } = useStudentData();

  // Filter today's schedule
  const today = new Date().getDay();
  const todaySchedule = fullSchedule?.filter(s => s.day_of_week === today) || [];

  // Calculate average grade (on the fly or from query)
  const gradesToAvg = recentGrades?.slice(0, 5) || [];
  const averageGrade = gradesToAvg.length > 0
    ? (gradesToAvg.reduce((sum: number, g: any) => {
      const percentage = (g.score / (g.assessments?.max_score || 20)) * 20;
      return sum + percentage;
    }, 0) / gradesToAvg.length).toFixed(2)
    : null;

  const stats = [
    {
      label: "Moyenne Générale",
      value: averageGrade || "--",
      suffix: averageGrade ? "/20" : "",
      icon: TrendingUp,
      color: "text-green-600",
      bgColor: "bg-green-500/10"
    },
    {
      label: "Notes récentes",
      value: recentGrades?.length || 0,
      icon: FileText,
      color: "text-blue-600",
      bgColor: "bg-blue-500/10"
    },
    {
      label: "Cours aujourd'hui",
      value: todaySchedule.length,
      icon: Calendar,
      color: "text-primary",
      bgColor: "bg-primary/10"
    },
    {
      label: "Devoirs à rendre",
      value: homework?.length || 0,
      icon: ClipboardList,
      color: "text-orange-600",
      bgColor: "bg-orange-500/10"
    },
  ];

  const quickLinks = [
    { href: getTenantUrl("/student/grades"), label: "Mes Notes", icon: FileText },
    { href: getTenantUrl("/student/schedule"), label: "Emploi du temps", icon: Calendar },
    { href: getTenantUrl("/student/homework"), label: "Devoirs", icon: BookOpen },
    { href: getTenantUrl("/student/messages"), label: "Messages", icon: MessageSquare },
  ];

  if (isDataLoading) {
    return <TableSkeleton columns={4} rows={10} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-6 items-stretch">
        <div className="flex-1">
          <StudentDashboardHeader
            name={student?.first_name || ""}
            className={enrollment?.class_name}
            studentLabel={StudentLabel}
          />
        </div>
        <StudentDigitalBadge
          student={student as any}
          className="w-full md:w-auto h-full"
        />
      </div>

      <StudentStatsGrid stats={stats} />

      <StudentQuickLinks links={quickLinks} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Performance Trend Chart */}
        <Card className="lg:col-span-2 border-primary/5 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-primary" />
              Évolution de mes résultats
            </CardTitle>
          </CardHeader>
          <CardContent className="h-[250px] pt-4">
            {recentGrades && recentGrades.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={recentGrades
                    .slice(0, 15)
                    .reverse()
                    .map(g => ({
                      date: format(new Date(g.created_at), "dd/MM"),
                      score: (g.score / (g.assessments?.max_score || 20)) * 20,
                    }))}
                >
                  <defs>
                    <linearGradient id="studentColorScore" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--muted-foreground))" opacity={0.1} />
                  <XAxis
                    dataKey="date"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis
                    domain={[0, 20]}
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    ticks={[0, 5, 10, 15, 20]}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--background))',
                      borderColor: 'hsl(var(--border))',
                      borderRadius: '12px',
                      fontSize: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                    }}
                    formatter={(value: number) => [value.toFixed(1) + "/20", "Moyenne"]}
                  />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="hsl(var(--primary))"
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#studentColorScore)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                <TrendingUp className="w-12 h-12 mb-2 opacity-10" />
                <p>Pas encore de notes pour afficher le graphique</p>
              </div>
            )}
          </CardContent>
        </Card>

        <StudentTodaySchedule schedule={todaySchedule} />
        <StudentUpcomingHomework homework={homework?.slice(0, 5) || []} getTenantUrl={getTenantUrl} />
        <StudentRecentGrades grades={recentGrades?.slice(0, 5) || []} getTenantUrl={getTenantUrl} />
        <CheckInHistoryList checkIns={checkInHistory || []} isLoading={isDataLoading} />

        <div className="lg:col-span-2 grid grid-cols-1 lg:grid-cols-3 gap-6">
          <ReminderSystem />
          <SharedNotes />
          <CollaborativeTools />
        </div>
      </div>
    </div>
  );
};

export default StudentDashboard;
