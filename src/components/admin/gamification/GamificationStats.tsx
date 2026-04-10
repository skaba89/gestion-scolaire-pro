import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Star, Award, Users, TrendingUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface GamificationStatsProps {
    stats: {
        totalPoints: number;
        totalAchievements: number;
        totalStudents: number;
    } | null;
}

export const GamificationStats = ({ stats }: GamificationStatsProps) => {
    const { t } = useTranslation();

    const containerVariants = {
        hidden: { opacity: 0 },
        show: {
            opacity: 1,
            transition: {
                staggerChildren: 0.1
            }
        }
    };

    const itemVariants = {
        hidden: { opacity: 0, y: 20 },
        show: { opacity: 1, y: 0 }
    };

    const statCards = [
        {
            title: t("gamification.totalPoints", "Points Distribués"),
            value: stats?.totalPoints?.toLocaleString() || 0,
            icon: Star,
            colorClass: "text-amber-500",
            bgClass: "bg-amber-500/10",
            borderClass: "border-amber-500/20"
        },
        {
            title: t("gamification.achievementsEarned", "Badges Obtenus"),
            value: stats?.totalAchievements || 0,
            icon: Award,
            colorClass: "text-purple-500",
            bgClass: "bg-purple-500/10",
            borderClass: "border-purple-500/20"
        },
        {
            title: t("gamification.activeStudents", "Étudiants Actifs"),
            value: stats?.totalStudents || 0,
            icon: Users,
            colorClass: "text-blue-500",
            bgClass: "bg-blue-500/10",
            borderClass: "border-blue-500/20"
        },
        {
            title: t("gamification.avgPoints", "Moyenne/Étudiant"),
            value: stats?.totalStudents ? Math.round((stats?.totalPoints || 0) / stats.totalStudents) : 0,
            icon: TrendingUp,
            colorClass: "text-emerald-500",
            bgClass: "bg-emerald-500/10",
            borderClass: "border-emerald-500/20"
        }
    ];

    return (
        <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid gap-4 md:grid-cols-4 mb-6"
        >
            {statCards.map((card, index) => (
                <motion.div key={index} variants={itemVariants}>
                    <Card className={cn(
                        "glass-card border-none shadow-premium hover:shadow-xl transition-all duration-300 group overflow-hidden relative",
                        card.borderClass
                    )}>
                        <div className={cn("absolute -right-4 -top-4 w-24 h-24 rounded-full blur-3xl opacity-20 transition-opacity group-hover:opacity-40", card.bgClass)} />

                        <CardHeader className="flex flex-row items-center justify-between pb-2 relative z-10">
                            <CardTitle className="text-sm font-medium text-muted-foreground">{card.title}</CardTitle>
                            <div className={cn("p-2 rounded-xl transition-transform group-hover:scale-110 duration-300", card.bgClass)}>
                                <card.icon className={cn("h-4 w-4", card.colorClass)} />
                            </div>
                        </CardHeader>
                        <CardContent className="relative z-10">
                            <div className="text-2xl font-bold tracking-tight">{card.value}</div>
                        </CardContent>
                    </Card>
                </motion.div>
            ))}
        </motion.div>
    );
};
