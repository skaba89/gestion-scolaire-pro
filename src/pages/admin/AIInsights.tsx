import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { useAIInsights } from "@/hooks/useAIInsights";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, AlertTriangle, Target, LineChart, Sparkles, Lightbulb } from "lucide-react";
import { AIStats } from "@/components/admin/ai/AIStats";
import { StudentRiskList } from "@/components/admin/ai/StudentRiskList";
import { AIRecommendations } from "@/components/admin/ai/AIRecommendations";
import { AICharts } from "@/components/admin/ai/AICharts";
import { AIActions } from "@/components/admin/ai/AIActions";
import { AIAssistant } from "@/components/admin/ai/AIAssistant";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function AIInsights() {
  const { t } = useTranslation("aiInsights");
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { studentRisks, predictions, recommendations, classrooms, raw } = useAIInsights();

  const handleRefresh = () => {
    setIsAnalyzing(true);
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["students-for-ai"] }),
      queryClient.invalidateQueries({ queryKey: ["grades-for-ai"] }),
      queryClient.invalidateQueries({ queryKey: ["attendance-for-ai"] }),
      queryClient.invalidateQueries({ queryKey: ["classrooms"] }),
    ]).then(() => {
      setIsAnalyzing(false);
      toast.success(t("aiInsights.refreshSuccess"));
    }).catch(() => {
      setIsAnalyzing(false);
      toast.error(t("aiInsights.refreshError"));
    });
  };

  const avgGrade = raw.grades.length > 0
    ? Math.round(raw.grades.reduce((sum: number, g: any) => sum + ((g.score / (g.assessment?.max_score || 20)) * 100), 0) / raw.grades.length)
    : 0;

  const presentCount = raw.attendance.filter((a: any) => a.status === "PRESENT" || a.status === "present").length;
  const attendanceRate = raw.attendance.length > 0
    ? Math.round((presentCount / raw.attendance.length) * 100)
    : 0;


  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-3">
            <Brain className="h-8 w-8 text-primary" />
            {t("aiInsights.pageTitle")}
          </h1>
          <p className="text-muted-foreground">{t("aiInsights.pageSubtitle")}</p>
        </div>
        <AIActions
          tenantName={tenant?.name}
          studentRisks={studentRisks}
          predictions={predictions}
          recommendations={recommendations}
          onRefresh={handleRefresh}
          isAnalyzing={isAnalyzing}
        />
      </div>

      <AIStats predictions={predictions} />

      <Tabs defaultValue="risks" className="space-y-6">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="risks" className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="hidden sm:inline">{t("aiInsights.tabRisks")}</span>
            <span className="sm:hidden">{t("aiInsights.tabRisks")}</span>
          </TabsTrigger>
          <TabsTrigger value="recommendations" className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4" />
            <span className="hidden sm:inline">{t("aiInsights.tabRecommendations")}</span>
            <span className="sm:hidden">{t("aiInsights.tabRecommendationsShort")}</span>
          </TabsTrigger>
          <TabsTrigger value="analysis" className="flex items-center gap-2">
            <Target className="h-4 w-4" />
            <span className="hidden sm:inline">{t("aiInsights.tabAnalysis")}</span>
            <span className="sm:hidden">{t("aiInsights.tabAnalysis")}</span>
          </TabsTrigger>
          <TabsTrigger value="assistant" className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            <span className="hidden sm:inline">{t("aiInsights.tabAssistant")}</span>
            <span className="sm:hidden">{t("aiInsights.tabAssistantShort")}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="risks" className="space-y-4">
          <StudentRiskList studentRisks={studentRisks} classrooms={classrooms} />
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <AIRecommendations recommendations={recommendations} />
        </TabsContent>

        <TabsContent value="analysis">
          <AICharts studentRisks={studentRisks} classrooms={classrooms} />
        </TabsContent>

        <TabsContent value="assistant">
          <AIAssistant
            studentRisks={studentRisks}
            totalStudents={raw.students.length}
            avgGrade={avgGrade}
            attendanceRate={attendanceRate}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

