import { useQuery } from "@tanstack/react-query";
import { useTenant } from "@/contexts/TenantContext";
import { useTranslation } from "react-i18next";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Crown, Medal, Sparkles, Settings } from "lucide-react";
import { Leaderboard } from "@/components/gamification/Leaderboard";
import { AchievementsList } from "@/components/gamification/AchievementsList";
import { PointsManager } from "@/components/gamification/PointsManager";
import { adminQueries } from "@/queries/admin";
import { GamificationHeader } from "@/components/admin/gamification/GamificationHeader";
import { GamificationStats } from "@/components/admin/gamification/GamificationStats";
import { GamificationRulesManager } from "@/components/gamification/GamificationRulesManager";
import { motion } from "framer-motion";

const Gamification = () => {
  const { t } = useTranslation();
  const { tenant } = useTenant();

  const { data: stats } = useQuery({
    ...adminQueries.adminGamificationStats(tenant?.id || ""),
    enabled: !!tenant?.id
  });

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-8 pb-12"
    >
      <GamificationHeader />

      <GamificationStats stats={stats || null} />

      <Tabs defaultValue="leaderboard" className="space-y-6">
        <TabsList className="bg-muted/50 backdrop-blur-md p-1 rounded-2xl border border-primary/5 grid w-full grid-cols-4 max-w-3xl mx-auto shadow-premium">
          <TabsTrigger
            value="leaderboard"
            className="flex items-center gap-2 rounded-xl transition-all data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm py-3 font-bold"
          >
            <Crown className="h-4 w-4" />
            {t("gamification.leaderboard", "Classement")}
          </TabsTrigger>
          <TabsTrigger
            value="achievements"
            className="flex items-center gap-2 rounded-xl transition-all data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm py-3 font-bold"
          >
            <Medal className="h-4 w-4" />
            {t("gamification.achievements", "Bibliothèque")}
          </TabsTrigger>
          <TabsTrigger
            value="points"
            className="flex items-center gap-2 rounded-xl transition-all data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm py-3 font-bold"
          >
            <Sparkles className="h-4 w-4" />
            {t("gamification.managePoints", "Actions")}
          </TabsTrigger>
          <TabsTrigger
            value="rules"
            className="flex items-center gap-2 rounded-xl transition-all data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm py-3 font-bold"
          >
            <Settings className="h-4 w-4" />
            Règles Auto
          </TabsTrigger>
        </TabsList>

        <motion.div
          layout
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <TabsContent value="leaderboard" className="mt-0 focus-visible:outline-none">
            <Leaderboard />
          </TabsContent>

          <TabsContent value="achievements" className="mt-0 focus-visible:outline-none">
            <AchievementsList />
          </TabsContent>

          <TabsContent value="points" className="mt-0 focus-visible:outline-none">
            <PointsManager />
          </TabsContent>

          <TabsContent value="rules" className="mt-0 focus-visible:outline-none">
            <GamificationRulesManager />
          </TabsContent>
        </motion.div>
      </Tabs>
    </motion.div>
  );
};

export default Gamification;
