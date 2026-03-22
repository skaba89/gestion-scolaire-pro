import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/contexts/TenantContext";
import { useTranslation } from "react-i18next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Crown, Medal, Trophy, Star, TrendingUp, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const getRankIcon = (rank: number) => {
  switch (rank) {
    case 1:
      return <Crown className="h-8 w-8 text-yellow-500 drop-shadow-md" />;
    case 2:
      return <Medal className="h-7 w-7 text-slate-400 drop-shadow-sm" />;
    case 3:
      return <Medal className="h-7 w-7 text-amber-700 drop-shadow-sm" />;
    default:
      return <span className="text-lg font-mono font-bold text-muted-foreground/60">#{rank}</span>;
  }
};

const getRankBadge = (rank: number) => {
  switch (rank) {
    case 1:
      return "bg-gradient-to-r from-yellow-400 via-amber-500 to-yellow-600 text-white border-none shadow-sm";
    case 2:
      return "bg-gradient-to-r from-slate-300 via-slate-400 to-slate-500 text-white border-none shadow-sm";
    case 3:
      return "bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white border-none shadow-sm";
    default:
      return "bg-muted text-muted-foreground border-none";
  }
};

export const Leaderboard = () => {
  const { t } = useTranslation();
  const { tenant } = useTenant();
  const [filter, setFilter] = useState<string>("all");
  const [period, setPeriod] = useState<string>("all");

  // Fetch classrooms for filter
  const { data: classrooms } = useQuery({
    queryKey: ["classrooms", tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      const { data } = await supabase
        .from("classrooms")
        .select("id, name")
        .eq("tenant_id", tenant.id)
        .order("name");
      return data || [];
    },
    enabled: !!tenant?.id
  });

  // Fetch leaderboard data
  const { data: leaderboard, isLoading } = useQuery({
    queryKey: ["leaderboard", tenant?.id, filter, period],
    queryFn: async () => {
      if (!tenant?.id) return [];

      let studentsQuery = supabase
        .from("students")
        .select(`
          id,
          first_name,
          last_name,
          photo_url,
          enrollments!inner(class_id, classrooms(name))
        `)
        .eq("tenant_id", tenant.id)
        .eq("is_archived", false);

      if (filter !== "all") {
        studentsQuery = studentsQuery.eq("enrollments.class_id", filter);
      }

      const { data: students } = await studentsQuery;
      if (!students) return [];

      const studentIds = students.map(s => s.id);
      let pointsQuery = supabase
        .from("point_transactions")
        .select("student_id, points, created_at")
        .eq("tenant_id", tenant.id)
        .in("student_id", studentIds);

      if (period === "week") {
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        pointsQuery = pointsQuery.gte("created_at", weekAgo.toISOString());
      } else if (period === "month") {
        const monthAgo = new Date();
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        pointsQuery = pointsQuery.gte("created_at", monthAgo.toISOString());
      }

      const { data: transactions } = await pointsQuery;

      const { data: achievements } = await supabase
        .from("student_achievements")
        .select("student_id")
        .eq("tenant_id", tenant.id)
        .in("student_id", studentIds);

      const leaderboardData = students.map(student => {
        const studentPoints = transactions
          ?.filter(t => t.student_id === student.id)
          .reduce((sum, t) => sum + t.points, 0) || 0;

        const studentAchievements = achievements
          ?.filter(a => a.student_id === student.id).length || 0;

        const enrollment = student.enrollments?.[0];
        const classroom = enrollment?.classrooms as any;

        return {
          id: student.id,
          firstName: student.first_name,
          lastName: student.last_name,
          photoUrl: student.photo_url,
          className: classroom?.name || "-",
          points: studentPoints,
          achievements: studentAchievements
        };
      });

      return leaderboardData
        .sort((a, b) => b.points - a.points)
        .slice(0, 50);
    },
    enabled: !!tenant?.id
  });

  return (
    <Card className="glass-card border-none shadow-premium overflow-hidden relative">
      <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -mr-32 -mt-32" />

      <CardHeader className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-6">
        <div>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6 text-yellow-500" />
            {t("gamification.leaderboard", "Le Mur des Champions")}
          </CardTitle>
          <CardDescription>
            {t("gamification.leaderboardDescription", "Découvrez les étudiants les plus engagés de l'établissement")}
          </CardDescription>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-full md:w-[140px] rounded-xl border-primary/10 bg-background/50 backdrop-blur-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("gamification.allTime", "Tout le temps")}</SelectItem>
              <SelectItem value="month">{t("gamification.thisMonth", "Ce mois")}</SelectItem>
              <SelectItem value="week">{t("gamification.thisWeek", "Cette semaine")}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-full md:w-[180px] rounded-xl border-primary/10 bg-background/50 backdrop-blur-sm">
              <SelectValue placeholder={t("gamification.allClasses", "Toutes les classes")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("gamification.allClasses", "Toutes les classes")}</SelectItem>
              {classrooms?.map((classroom) => (
                <SelectItem key={classroom.id} value={classroom.id}>
                  {classroom.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="relative z-10">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <div className="relative">
              <div className="h-12 w-12 border-4 border-primary/10 rounded-full animate-pulse" />
              <div className="absolute inset-0 h-12 w-12 border-t-4 border-primary rounded-full animate-spin" />
            </div>
            <p className="text-sm font-medium text-muted-foreground animate-pulse">Calcul du classement...</p>
          </div>
        ) : leaderboard?.length === 0 ? (
          <div className="text-center py-20 bg-muted/20 rounded-3xl border border-dashed border-primary/10">
            <Trophy className="h-16 w-16 mx-auto mb-4 opacity-10" />
            <p className="text-lg font-medium">{t("gamification.noData", "Le podium attend ses champions")}</p>
            <p className="text-sm text-muted-foreground mt-1">Commencez à distribuer des points pour voir le classement.</p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {leaderboard?.map((student, index) => {
                const rank = index + 1;
                const isTopThree = rank <= 3;

                return (
                  <motion.div
                    key={student.id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "flex items-center gap-4 p-4 rounded-2xl transition-all relative overflow-hidden group",
                      isTopThree
                        ? "bg-gradient-to-r from-primary/10 via-background to-background border border-primary/20 shadow-premium"
                        : "bg-muted/30 hover:bg-primary/5 hover:border-primary/10 border border-transparent"
                    )}
                  >
                    {isTopThree && (
                      <div className="absolute -left-10 -top-10 w-32 h-32 bg-primary/5 rounded-full blur-2xl group-hover:bg-primary/10 transition-colors" />
                    )}

                    <div className="w-12 flex justify-center relative z-10">
                      {getRankIcon(rank)}
                    </div>

                    <div className="relative z-10">
                      <Avatar className={cn(
                        "h-12 w-12 border-2 shadow-sm transition-transform duration-300 group-hover:scale-105",
                        isTopThree ? "border-primary/20 ring-2 ring-primary/5" : "border-background"
                      )}>
                        <AvatarImage src={student.photoUrl || undefined} />
                        <AvatarFallback className={cn(
                          "font-bold",
                          isTopThree ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                        )}>
                          {student.firstName?.[0]}{student.lastName?.[0]}
                        </AvatarFallback>
                      </Avatar>
                      {rank === 1 && (
                        <motion.div
                          animate={{ rotate: [0, 10, -10, 0] }}
                          transition={{ repeat: Infinity, duration: 4 }}
                          className="absolute -top-1 -right-1"
                        >
                          <Sparkles className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        </motion.div>
                      )}
                    </div>

                    <div className="flex-1 relative z-10">
                      <div className="flex items-center gap-2">
                        <p className={cn(
                          "font-bold transition-colors",
                          isTopThree ? "text-lg text-primary" : "text-foreground group-hover:text-primary"
                        )}>
                          {student.firstName} {student.lastName}
                        </p>
                        {isTopThree && (
                          <Badge className={cn("text-[10px] font-bold px-2 py-0", getRankBadge(rank))}>
                            {rank === 1 ? 'MAJOR' : rank === 2 ? 'EXCELLENCE' : 'PASSION'}
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5 mt-0.5">
                        <TrendingUp className="h-3 w-3" />
                        {student.className}
                      </p>
                    </div>

                    <div className="text-right relative z-10">
                      <div className="flex items-center justify-end gap-1.5 text-amber-600 font-black text-lg">
                        <Star className="h-4 w-4 fill-amber-500" />
                        {student.points.toLocaleString()}
                      </div>
                      <p className="text-[10px] font-bold text-muted-foreground/60 uppercase tracking-wider">
                        {student.achievements} {t("gamification.badges", "badges")}
                      </p>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
