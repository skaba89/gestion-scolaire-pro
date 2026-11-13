import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useParentAnalytics } from "./parent/hooks/useParentAnalytics";
import { AnalyticsRecommendations } from "./parent/AnalyticsRecommendations";
import { AnalyticsMetrics } from "./parent/AnalyticsMetrics";
import { AnalyticsGradesTab } from "./parent/tabs/AnalyticsGradesTab";
import { AnalyticsSubjectsTab } from "./parent/tabs/AnalyticsSubjectsTab";
import { AnalyticsAttendanceTab } from "./parent/tabs/AnalyticsAttendanceTab";
import { AnalyticsHomeworkTab } from "./parent/tabs/AnalyticsHomeworkTab";
import { AnalyticsGamificationTab } from "./parent/tabs/AnalyticsGamificationTab";
import { useTranslation } from "react-i18next";

interface ParentAnalyticsDashboardProps {
  studentId: string;
  tenantId: string;
}

export const ParentAnalyticsDashboard = ({ studentId, tenantId }: ParentAnalyticsDashboardProps) => {
  const { t } = useTranslation();
  const {
    gradesByMonth,
    subjectPerformance,
    attendanceByMonth,
    assessmentTypeDistribution,
    pointsByCategory,
    overallStats,
    recommendations,
    homeworkTimingData,
    homeworkData,
    achievements
  } = useParentAnalytics(studentId, tenantId);

  return (
    <div className="space-y-6">
      {/* AI Recommendations */}
      <AnalyticsRecommendations recommendations={recommendations} />

      {/* Key Metrics */}
      <AnalyticsMetrics overallStats={overallStats} />

      <Tabs defaultValue="grades">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="grades">{t("parentPortal.analyticsTabs.grades")}</TabsTrigger>
          <TabsTrigger value="subjects">{t("parentPortal.analyticsTabs.subjects")}</TabsTrigger>
          <TabsTrigger value="attendance">{t("parentPortal.analyticsTabs.attendance")}</TabsTrigger>
          <TabsTrigger value="homework">{t("parentPortal.analyticsTabs.homework")}</TabsTrigger>
          <TabsTrigger value="gamification">{t("parentPortal.analyticsTabs.gamification")}</TabsTrigger>
        </TabsList>

        <TabsContent value="grades">
          <AnalyticsGradesTab
            gradesByMonth={gradesByMonth}
            assessmentTypeDistribution={assessmentTypeDistribution}
          />
        </TabsContent>

        <TabsContent value="subjects">
          <AnalyticsSubjectsTab subjectPerformance={subjectPerformance} />
        </TabsContent>

        <TabsContent value="attendance">
          <AnalyticsAttendanceTab attendanceByMonth={attendanceByMonth} />
        </TabsContent>

        <TabsContent value="homework">
          <AnalyticsHomeworkTab
            homeworkData={homeworkData}
            homeworkTimingData={homeworkTimingData}
          />
        </TabsContent>

        <TabsContent value="gamification">
          <AnalyticsGamificationTab
            pointsByCategory={pointsByCategory}
            achievements={achievements}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};
