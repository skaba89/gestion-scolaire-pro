/**
 * Badge Achievements Page
 * Full page displaying user badges, stats, leaderboard, and progress
 */

import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenant } from "@/contexts/TenantContext";
import { useQuery } from "@tanstack/react-query";
import { getUserBadges, getUserBadgeStats } from "@/lib/badge-service";
import { BadgeGrid } from "@/components/badges/BadgeGrid";
import { BadgeStats, BadgeType } from "@/lib/badges-types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Trophy, Target, Zap, Award, Sparkles, Star, TrendingUp, Lightbulb, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { Leaderboard } from "@/components/gamification/Leaderboard";
import { Badge } from "@/components/ui/badge";

export const BadgeAchievementsPage: React.FC = () => {
  const { user } = useAuth();
  const { currentTenant } = useTenant();
  const [activeTab, setActiveTab] = useState("badges");

  const { data: userBadges = [], isLoading: badgesLoading } = useQuery({
    queryKey: ["userBadges", user?.id, currentTenant?.id],
    queryFn: () => getUserBadges(user!.id, currentTenant!.id),
    enabled: !!user && !!currentTenant,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["badgeStats", user?.id, currentTenant?.id],
    queryFn: () => getUserBadgeStats(user!.id, currentTenant!.id),
    enabled: !!user && !!currentTenant,
  });

  const isLoading = badgesLoading || statsLoading;

  const typeConfig: Record<BadgeType, { icon: React.ReactNode; color: string; label: string; bg: string }> = {
    performance: {
      icon: <Zap size={20} />,
      color: "text-rose-500",
      bg: "bg-rose-500/10",
      label: "Performance",
    },
    achievement: {
      icon: <Trophy size={20} />,
      color: "text-amber-500",
      bg: "bg-amber-500/10",
      label: "Succès",
    },
    certification: {
      icon: <Award size={20} />,
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
      label: "Certificats",
    },
    attendance: {
      icon: <Target size={20} />,
      color: "text-indigo-500",
      bg: "bg-indigo-500/10",
      label: "Assiduité",
    },
    participation: {
      icon: <Star size={20} />,
      color: "text-blue-500",
      bg: "bg-blue-500/10",
      label: "Participation",
    },
  };

  const totalBadgesAvailable = 25;
  const completionPercentage = Math.round(((stats?.totalBadges || 0) / totalBadgesAvailable) * 100);

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8 pb-12"
    >
      {/* Header Premium */}
      <motion.div
        variants={itemVariants}
        className="relative p-10 rounded-[3rem] overflow-hidden bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 shadow-2xl"
      >
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/10 rounded-full blur-3xl -mr-32 -mt-32 animate-pulse" />
        <div className="absolute bottom-0 left-0 w-64 h-64 bg-black/10 rounded-full blur-3xl -ml-16 -mb-16" />

        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-center md:text-left">
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/20 backdrop-blur-md text-white border border-white/20 text-xs font-bold uppercase tracking-wider mb-4"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Progression Académique
            </motion.div>
            <h1 className="text-5xl font-black text-white tracking-tight mb-2">Hall des Trophées</h1>
            <p className="text-indigo-100 text-lg max-w-md font-medium">
              Célébrez vos exploits, collectionnez les badges et grimpez au sommet de l'excellence.
            </p>
          </div>
          <div className="flex items-center gap-6">
            <div className="h-24 w-24 rounded-full border-4 border-white/30 p-2 relative">
              <div className="absolute inset-0 flex items-center justify-center text-white font-black text-2xl">
                {completionPercentage}%
              </div>
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="transparent"
                  className="text-white/20"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="transparent"
                  strokeDasharray={226.2}
                  strokeDashoffset={226.2 - (226.2 * completionPercentage) / 100}
                  className="text-white transition-all duration-1000 ease-out"
                />
              </svg>
            </div>
            <div className="text-white">
              <p className="text-3xl font-black">{stats?.totalBadges || 0}</p>
              <p className="text-xs font-bold uppercase opacity-80 tracking-widest">Badges Obtenus</p>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Stats Cards Premium */}
      <motion.div variants={containerVariants} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div variants={itemVariants}>
          <Card className="glass-card border-none shadow-premium hover:shadow-2xl transition-all duration-500 overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition-colors" />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                <div className="p-2 rounded-xl bg-blue-500/10"><Trophy className="text-blue-500 h-5 w-5" /></div>
                Volume de Succès
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black tracking-tighter">{stats?.totalBadges || 0}</span>
                <span className="text-muted-foreground font-bold">Insignes</span>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs font-bold text-emerald-500 bg-emerald-500/10 w-fit px-2 py-1 rounded-lg">
                <TrendingUp className="h-3 w-3" />
                +{stats?.recentBadges.length || 0} ce mois-ci
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="glass-card border-none shadow-premium hover:shadow-2xl transition-all duration-500 overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition-colors" />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                <div className="p-2 rounded-xl bg-purple-500/10"><Target className="text-purple-500 h-5 w-5" /></div>
                Objectif Global
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-5xl font-black tracking-tighter">{completionPercentage}%</span>
                <span className="text-muted-foreground font-bold">Complétion</span>
              </div>
              <Progress value={completionPercentage} className="h-3 mt-4 bg-purple-500/10" />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="glass-card border-none shadow-premium hover:shadow-2xl transition-all duration-500 overflow-hidden group">
            <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition-colors" />
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-3 text-sm font-bold uppercase tracking-wider text-muted-foreground">
                <div className="p-2 rounded-xl bg-amber-500/10"><Zap className="text-amber-500 h-5 w-5" /></div>
                Rareté Maximale
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black tracking-tighter text-amber-600">
                  {stats?.badgesByRarity.legendary || 0}
                </span>
                <span className="text-muted-foreground font-bold">Légendaires</span>
              </div>
              <div className="mt-4 flex items-center gap-2 text-xs font-bold text-amber-600">
                <Sparkles className="h-3 w-3" />
                Explorez vos succès épiques
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>

      {/* Type Breakdown Interactive */}
      <motion.div variants={itemVariants}>
        <Card className="glass-card border-none shadow-premium">
          <CardHeader>
            <CardTitle className="text-xl font-black">Répartition Sectorielle</CardTitle>
            <CardDescription>Visualisez vos forces à travers les différentes catégories de badges.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              {Object.entries(stats?.badgesByType || {}).map(([type, count]) => {
                const config = typeConfig[type as BadgeType];
                if (!config) return null;
                return (
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    key={type}
                    className={cn(
                      "rounded-2xl border p-4 text-center transition-all shadow-sm",
                      config.bg,
                      "border-primary/5"
                    )}
                  >
                    <div className={cn("flex justify-center mb-2 p-2 rounded-xl bg-white/50 inline-block mx-auto", config.color)}>
                      {config.icon}
                    </div>
                    <p className="font-bold text-xs mb-1 text-muted-foreground uppercase tracking-wider">{config.label}</p>
                    <p className="text-3xl font-black">{count || 0}</p>
                  </motion.div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Main Content Tabs Glass */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full space-y-6">
        <TabsList className="bg-muted/50 backdrop-blur-md p-1 rounded-2xl border border-primary/5 grid w-full grid-cols-3 max-w-2xl mx-auto shadow-premium">
          <TabsTrigger value="badges" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm font-bold py-3 transition-all">
            Mes Insignes
          </TabsTrigger>
          <TabsTrigger value="next" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm font-bold py-3 transition-all">
            Défis à Venir
          </TabsTrigger>
          <TabsTrigger value="leaderboard" className="rounded-xl data-[state=active]:bg-background data-[state=active]:shadow-sm font-bold py-3 transition-all">
            Classement Général
          </TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, scale: 0.98, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ duration: 0.3 }}
          >
            <TabsContent value="badges" className="mt-0 focus-visible:outline-none">
              <BadgeGrid
                badges={userBadges}
                isLoading={isLoading}
                showFilters={true}
                emptyState={
                  <div className="text-center py-20 bg-muted/20 rounded-3xl border border-dashed border-primary/10">
                    <Award className="h-16 w-16 mx-auto mb-4 opacity-10" />
                    <p className="text-lg font-medium">Votre collection est vide</p>
                    <p className="text-sm text-muted-foreground mt-1">Relevez vos premiers défis pour débloquer des badges exclusifs.</p>
                  </div>
                }
              />
            </TabsContent>

            <TabsContent value="next" className="mt-0 focus-visible:outline-none">
              <Card className="glass-card border-none shadow-premium overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />
                <CardHeader className="relative z-10">
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <TrendingUp className="h-6 w-6 text-primary" />
                    Vos Prochains Objectifs
                  </CardTitle>
                  <CardDescription>
                    Ces récompenses sont à portée de main. Concentrez vos efforts pour les obtenir.
                  </CardDescription>
                </CardHeader>
                <CardContent className="relative z-10">
                  {stats?.nextMilestones && stats.nextMilestones.length > 0 ? (
                    <div className="grid gap-4 md:grid-cols-2">
                      {stats.nextMilestones.slice(0, 6).map((badge) => (
                        <div
                          key={badge.id}
                          className="flex items-center justify-between p-5 rounded-3xl bg-background/40 border border-primary/5 hover:bg-background/60 hover:shadow-premium transition-all group"
                        >
                          <div className="flex-1">
                            <h4 className="font-bold text-lg group-hover:text-primary transition-colors">{badge.name}</h4>
                            <p className="text-sm text-muted-foreground leading-relaxed">{badge.description}</p>
                          </div>
                          <div className="flex items-center gap-3 ml-4">
                            <Badge className={cn(
                              "rounded-full px-3 py-1 font-black text-[10px] tracking-widest uppercase",
                              badge.rarity === "legendary" ? "bg-amber-500 shadow-amber-500/20" :
                                badge.rarity === "epic" ? "bg-purple-500 shadow-purple-500/20" :
                                  badge.rarity === "rare" ? "bg-blue-500 shadow-blue-500/20" : "bg-slate-500"
                            )}>
                              {badge.rarity}
                            </Badge>
                            <ChevronRight className="h-5 w-5 text-muted-foreground/30 group-hover:translate-x-1 group-hover:text-primary transition-all" />
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-20">
                      <Sparkles className="h-16 w-16 mx-auto mb-4 text-amber-500 animate-bounce" />
                      <p className="text-xl font-black">Légende Absolue !</p>
                      <p className="text-muted-foreground">Vous avez débloqué tous les badges actuels. Incroyable travail ! 🎉</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="leaderboard" className="mt-0 focus-visible:outline-none">
              <Leaderboard />
            </TabsContent>
          </motion.div>
        </AnimatePresence>
      </Tabs>

      {/* Conseils Strategiques */}
      <motion.div variants={itemVariants}>
        <Card className="glass-card border-none shadow-premium relative overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5" />
          <CardHeader className="relative z-10">
            <CardTitle className="flex items-center gap-2 text-emerald-700">
              <Lightbulb className="h-6 w-6" />
              Conseils pour Votre Ascension
            </CardTitle>
          </CardHeader>
          <CardContent className="relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                "Maintenez une assiduité parfaite pour les badges de régularité.",
                "Participez activement aux discussions pour le badge 'Communicateur'.",
                "Rendez vos devoirs en avance pour bonus de ponctualité.",
                "Aidez vos camarades pour débloquer les badges sociaux."
              ].map((tip, i) => (
                <div key={i} className="flex items-start gap-3 p-3 rounded-2xl bg-white/40 border border-white/60">
                  <div className="h-2 w-2 rounded-full bg-emerald-500 mt-2 shrink-0" />
                  <p className="text-sm font-medium text-emerald-900 leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
};

export default BadgeAchievementsPage;
