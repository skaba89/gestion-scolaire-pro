import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { AI_INSIGHTS_QUERY_KEYS, useAIInsights } from "@/hooks/useAIInsights";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Brain, AlertTriangle, Target, LineChart, Sparkles, Lightbulb } from "lucide-react";
import { AIStats } from "@/components/admin/ai/AIStats";
import { StudentRiskList } from "@/components/admin/ai/StudentRiskList";
import { AIRecommendations } from "@/components/admin/ai/AIRecommendations";
import { AICharts } from "@/components/admin/ai/AICharts";
import { AIActions } from "@/components/admin/ai/AIActions";
import { AIAssistant } from "@/components/admin/ai/AIAssistant";
import { PlanGate } from "@/components/ui/PlanGate";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

export default function AIInsights() {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const queryClient = useQueryClient();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const { studentRisks, predictions, recommendations, classrooms, kpis, isError } = useAIInsights();

  // Invalide les requêtes réellement utilisées par la page (les anciennes
  // clés n'existaient pas : « Analyse mise à jour » s'affichait sans rien
  // recharger).
  const handleRefresh = () => {
    setIsAnalyzing(true);
    Promise.all(
      AI_INSIGHTS_QUERY_KEYS.map((key) => queryClient.refetchQueries({ queryKey: [key], type: "active" })),
    )
      .then(() => {
        const failed = AI_INSIGHTS_QUERY_KEYS.some((key) =>
          queryClient.getQueryCache().findAll({ queryKey: [key] }).some((q) => q.state.status === "error"),
        );
        if (failed) toast.error(t("aiInsights.refreshError"));
        else toast.success(t("aiInsights.refreshSuccess"));
      })
      .catch(() => toast.error(t("aiInsights.refreshError")))
      .finally(() => setIsAnalyzing(false));
  };

  return (
    <PlanGate minPlan="standard">
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

      {isError && (
        <p role="alert" className="text-sm text-destructive">{t("aiInsights.loadError")}</p>
      )}

      <AIStats predictions={predictions} />

      <Tabs defaultValue="risks" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
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
          <AICharts studentRisks={studentRisks} />
        </TabsContent>

        <TabsContent value="assistant">
          <AIAssistant studentRisks={studentRisks} kpis={kpis} />
        </TabsContent>
      </Tabs>
    </div>
    </PlanGate>
  );
}

